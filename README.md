# aws-codepipeline-boot-2

Various way to deploy a spring boot application in AWS, aiming to prepare DOP-COX exam.

The project is deployed on 2 AWS accounts
- Cicd account (pipelines, secrets, etc...)
- Production account (Actual workload)

## GitHub organization secrets

```text
# Aws
AWS_PROD_ACCOUNT_ID=XXX
AWS_CICD_ACCOUNT_ID=XXX
AWS_ORGANIZATION_ID=XXX
AWS_ORGANIZATION_UNIT_ID=XXX
AWS_GITHUB_CONNECTION_ARN=XXX
# GitHub
GH_ACTIONS_ROLE_NAME=XXX
GH_AUTHORIZED_ACTOR=XXX
GH_ORG=XXX
GH_TOKEN_SECRET_NAME=XXX
```

## GitHub organization env vars

```text
# Aws
AWS_REGION=XXX
# GitHub
NODE_VERSION=XXX
PROJECT_NAME=XXX
```
