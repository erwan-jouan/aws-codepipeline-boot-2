# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Experiment repository for AWS deployment strategies targeting the AWS Professional DevOps certification. A single Spring Boot application is deployed via multiple AWS deployment patterns, each backed by dedicated CDK infrastructure.

## Repository structure

```
app/          Spring Boot 4.1.0 / Java 21 application
infra/cdk/    AWS CDK (TypeScript) infrastructure, one entry point per deployment
.github/workflows/  GitHub Actions deploy/destroy for each deployment type
```

## App commands (`app/`)

```bash
# Build fat JAR (default — for Docker/ECS/ASG)
mvn package

# Build shaded JAR for Lambda (no Tomcat, smaller)
mvn package -Plambda

# Run tests
mvn test

# Run a single test class
mvn test -Dtest=MyTestClass

# Run locally with a specific Spring profile
./run.sh        # pre-configured for alb-ecs-fargate profile

# Switch Java version on macOS
source switch-java.sh 21

# Docker build (multi-stage, layered)
docker build -t bluegreen .

# JFR profiling run
make profile
```

## CDK commands (`infra/cdk/`)

```bash
npm ci

# Synthesise a specific deployment (DEPLOYMENT_NAME set in .env)
make deploy     # runs: cdk synth --app "npx ts-node ... bin/${DEPLOYMENT_NAME}/cdk.ts"

# Deploy a stack directly
cdk deploy --app "npx ts-node --prefer-ts-exts bin/<deployment>/cdk.ts" <stack-name> --exclusively

# CDK tests
npm test
```

Active `DEPLOYMENT_NAME` in `.env` is `ec2-image-builder`. Change it to switch deployments.

## Deployment scenarios

Each scenario has its own `bin/<name>/cdk.ts` entry point and `lib/<name>/` stacks, plus a pair of GitHub Actions workflows (`*-deploy.yml` / `*-destroy.yml`, triggered manually via `workflow_dispatch`).

| Name | AWS pattern | CDK stacks |
|---|---|---|
| `alb-ecs-fargate` | Cross-account CodePipeline → ECS Fargate + ALB | `fargate-app` (PROD), `fargate-cicd` (CICD) |
| `asg-rolling-update` | Cross-account CodePipeline → ASG instance refresh | `asg-rolling-app` (PROD), `asg-rolling-cicd` (CICD) |
| `ec2-image-builder` | EC2 Image Builder pipeline → AMI → SSM parameter | Single stack in CICD account |

**Deploy order for cross-account scenarios**: always deploy the `*-app` stack (PROD account) before the `*-cicd` stack (CICD account) — the CICD stack references ARNs exported by the app stack.

## Cross-account setup

Two AWS accounts used throughout:
- **CICD account** (`CICD_ACCOUNT_ID`) — CodePipeline, CodeBuild, ECR, artifact S3, KMS
- **PROD account** (`PROD_ACCOUNT_ID`) — running infrastructure (ECS cluster, ASG, ALB, VPC)

GitHub Actions authenticates via OIDC (`GitHubActionsRole`) assumed separately into each account.

## Spring Boot app architecture

- Package root: `bluegreen`
- `conf/<deployment>/` — `@Configuration` classes activated by Spring profile matching the deployment name (e.g. `alb-ecs-fargate`, `asg-rolling-update`)
- `web/<deployment>/` — controllers per deployment
- `service/<deployment>/` — AWS SDK service calls per deployment
- `StreamLambdaHandler.java` — Lambda entry point (`aws-serverless-java-container-springboot4`)
- The `display_color` property in `application.yml` controls the blue/green colour displayed by the UI

## Important gotchas

**Jackson 3.x** — Spring Boot 4.x ships Jackson 3.x, which renamed the root package from `com.fasterxml.jackson` to `tools.jackson`. Use `tools.jackson.*` imports everywhere.

**Lambda vs container profiles** — `ServerlessAutoConfiguration` (from the Lambda container adapter) is excluded in `application.yml` to prevent it from hijacking the embedded Tomcat when running as a container. The `lambda` Maven profile produces a shaded JAR (no Tomcat) for actual Lambda deployments.

**Dockerfile layer paths** — Spring Boot 3.2+/4.x `jarmode=tools` extracts layers into a subdirectory named after the JAR (`/app/app/{layer}/`), not directly into `/app/{layer}/`.

**Spring Boot launcher class** — use `org.springframework.boot.loader.launch.JarLauncher` (changed in 3.2+; the old `org.springframework.boot.loader.JarLauncher` no longer exists).

**CDK CodeBuild image** — must be `LinuxBuildImage.STANDARD_7_0` (AL2023 + Corretto 21); `STANDARD_6_0` only has Java 17.
