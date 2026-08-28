#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AsgRollingAppStack } from '../../lib/asg-rolling-update/app/cdk-stack';
import { AsgRollingCicdStack } from '../../lib/asg-rolling-update/cicd/cdk-stack';

const app = new cdk.App();

// Cross-account ASG rolling update:
//   asg-rolling-update-app  → PROD account (VPC, ALB, ASG, cross-account deploy role)
//   asg-rolling-update-cicd → CICD account (CodePipeline: Maven build + CodeArtifact publish + instance refresh)
// Deploy order: app first, then cicd.

const prodAccountId = process.env.PROD_ACCOUNT_ID!;
const cicdAccountId = process.env.CICD_ACCOUNT_ID!;
const region = process.env.CDK_DEFAULT_REGION!;
const projectName = process.env.PROJECT_NAME!;
const deploymentName = process.env.DEPLOYMENT_NAME!;
const projectDeploymentName = process.env.PROJECT_DEPLOYMENT_NAME!;
const targetArchitecture = process.env.TARGET_ARCHITECTURE!;

const asgApp = 'asg-rolling-update-app';
new AsgRollingAppStack(app, asgApp, {
    stackName: asgApp,
    env: { account: prodAccountId, region },
    projectName,
    deploymentName,
    projectDeploymentName,
    cicdAccountId,
});

const asgCicd = 'asg-rolling-update-cicd';
new AsgRollingCicdStack(app, asgCicd, {
    stackName: asgCicd,
    env: { account: cicdAccountId, region },
    projectName,
    deploymentName,
    projectDeploymentName,
    prodAccountId,
    cicdAccountId,
    region,
    targetArchitecture,
});
