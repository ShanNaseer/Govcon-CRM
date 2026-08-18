#!/usr/bin/env bash
#
# Provision a publicly-accessible AWS RDS PostgreSQL instance for this project and
# print the DATABASE_URL to put in .env.
#
# Idempotent: re-running reuses an existing instance/security group of the same name.
#
# Requirements: awscli v2 with valid credentials (`aws sts get-caller-identity`),
# a default VPC in the target region, and permission to create RDS + EC2 security groups.
#
# Usage:
#   ./scripts/aws/provision-rds.sh                       # uses defaults below
#   DB_INSTANCE_ID=govcon-crm-prod AWS_REGION=us-east-1 ./scripts/aws/provision-rds.sh

set -euo pipefail

DB_INSTANCE_ID="${DB_INSTANCE_ID:-govcon-crm-db}"
DB_NAME="${DB_NAME:-govcon_crm}"
DB_USER="${DB_USER:-govcon_admin}"
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t4g.micro}"
DB_STORAGE_GB="${DB_STORAGE_GB:-20}"
SG_NAME="${SG_NAME:-${DB_INSTANCE_ID}-sg}"
AWS_REGION="${AWS_REGION:-$(aws configure get region)}"

if [[ -z "${AWS_REGION}" ]]; then
  echo "AWS_REGION is not set and no default region is configured." >&2
  exit 1
fi

aws() { command aws --region "${AWS_REGION}" "$@"; }

echo "==> Account / region"
aws sts get-caller-identity --output text --query 'Arn'
echo "    region: ${AWS_REGION}"

echo "==> Default VPC"
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)
if [[ "${VPC_ID}" == "None" || -z "${VPC_ID}" ]]; then
  echo "No default VPC in ${AWS_REGION}. Create one (aws ec2 create-default-vpc) or set up a VPC manually." >&2
  exit 1
fi
echo "    ${VPC_ID}"

echo "==> Security group ${SG_NAME}"
SG_ID=$(aws ec2 describe-security-groups \
  --filters Name=group-name,Values="${SG_NAME}" Name=vpc-id,Values="${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")
if [[ "${SG_ID}" == "None" || -z "${SG_ID}" ]]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name "${SG_NAME}" \
    --description "Postgres access for ${DB_INSTANCE_ID}" \
    --vpc-id "${VPC_ID}" \
    --query 'GroupId' --output text)
  echo "    created ${SG_ID}"
else
  echo "    reusing ${SG_ID}"
fi

# Allow only this machine's current public IP. Re-run the script after an IP change,
# or add further rules for other developers / your deploy environment.
MY_IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
echo "==> Allowing ${MY_IP}/32 on tcp/5432"
aws ec2 authorize-security-group-ingress \
  --group-id "${SG_ID}" \
  --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=${MY_IP}/32,Description=govcon-crm-dev}]" \
  >/dev/null 2>&1 || echo "    rule already present"

# Engine versions are region- and time-dependent, so a hardcoded default rots.
# Resolve the newest non-deprecated version unless the caller pinned one.
if [[ -z "${DB_ENGINE_VERSION:-}" ]]; then
  DB_ENGINE_VERSION=$(aws rds describe-db-engine-versions \
    --engine postgres \
    --query 'max_by(DBEngineVersions[?Status==`available`], &to_number(MajorEngineVersion)).EngineVersion' \
    --output text)
fi
echo "==> Engine postgres ${DB_ENGINE_VERSION}"

echo "==> RDS instance ${DB_INSTANCE_ID}"
if aws rds describe-db-instances --db-instance-identifier "${DB_INSTANCE_ID}" >/dev/null 2>&1; then
  echo "    already exists — skipping creation"
  DB_PASSWORD=""
else
  # Generated locally; never echoed into CloudTrail-visible arguments beyond the
  # create call itself. Store it in .env (git-ignored) or Secrets Manager.
  # Every stage reads its input to EOF: `head` bounds /dev/urandom up front and `cut`
  # consumes all of tr's output. Piping unbounded /dev/urandom into `head -c 32`
  # instead leaves `tr` writing to a closed pipe, and the resulting SIGPIPE (141)
  # aborts the script under `pipefail`. 1 KiB of random bytes yields ~240 alphanumeric
  # characters, comfortably more than the 32 required.
  DB_PASSWORD=$(head -c 1024 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-32)
  if [[ "${#DB_PASSWORD}" -ne 32 ]]; then
    echo "Failed to generate a 32-character password (got ${#DB_PASSWORD})." >&2
    exit 1
  fi

  aws rds create-db-instance \
    --db-instance-identifier "${DB_INSTANCE_ID}" \
    --db-name "${DB_NAME}" \
    --engine postgres \
    --engine-version "${DB_ENGINE_VERSION}" \
    --db-instance-class "${DB_INSTANCE_CLASS}" \
    --allocated-storage "${DB_STORAGE_GB}" \
    --storage-type gp3 \
    --storage-encrypted \
    --master-username "${DB_USER}" \
    --master-user-password "${DB_PASSWORD}" \
    --vpc-security-group-ids "${SG_ID}" \
    --publicly-accessible \
    --backup-retention-period 7 \
    --no-multi-az \
    --auto-minor-version-upgrade \
    --copy-tags-to-snapshot \
    --tags Key=Project,Value=govcon-crm \
    --output text --query 'DBInstance.DBInstanceIdentifier' >/dev/null
  echo "    creating — this takes roughly 5-10 minutes"
fi

echo "==> Waiting for availability"
aws rds wait db-instance-available --db-instance-identifier "${DB_INSTANCE_ID}"

ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier "${DB_INSTANCE_ID}" \
  --query 'DBInstances[0].Endpoint.Address' --output text)
PORT=$(aws rds describe-db-instances --db-instance-identifier "${DB_INSTANCE_ID}" \
  --query 'DBInstances[0].Endpoint.Port' --output text)

echo
echo "Endpoint: ${ENDPOINT}:${PORT}"
echo
if [[ -n "${DB_PASSWORD}" ]]; then
  echo "Add to .env (the password is shown once — it is not stored anywhere else):"
  echo
  echo "DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@${ENDPOINT}:${PORT}/${DB_NAME}?sslmode=require\""
else
  echo "Instance already existed, so no password was generated. Set DATABASE_URL to:"
  echo
  echo "DATABASE_URL=\"postgresql://${DB_USER}:<password>@${ENDPOINT}:${PORT}/${DB_NAME}?sslmode=require\""
fi
echo
echo "Then:  npm run db:ca  &&  npm run db:check  &&  npm run db:deploy"
