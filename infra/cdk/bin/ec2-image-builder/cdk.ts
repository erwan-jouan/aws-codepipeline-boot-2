#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Ec2ImageBuilderCicdStack } from '../../lib/ec2-image-builder/cicd/cdk-stack';
import { Ec2ImageBuilderAppStack } from '../../lib/ec2-image-builder/app/cdk-stack';

const app = new cdk.App();

const cicdAccountId = process.env.CICD_ACCOUNT_ID!;
const prodAccountId = process.env.PROD_ACCOUNT_ID!;
const region = process.env.CDK_DEFAULT_REGION!;
const projectName = process.env.PROJECT_NAME!;

// Deploy order: ec2-image-builder-app first (PROD account), then ec2-image-builder-cicd (CICD account).
// The CICD Lambda assumes the writer role to write the custom AMI ID into PROD account's SSM,
// so the role must exist before the CICD stack is deployed.
new Ec2ImageBuilderAppStack(app, 'ec2-image-builder-app', {
    stackName: 'ec2-image-builder-app',
    env: { account: prodAccountId, region },
    cicdAccountId,
});

new Ec2ImageBuilderCicdStack(app, 'ec2-image-builder-cicd', {
    stackName: 'ec2-image-builder-cicd',
    env: { account: cicdAccountId, region },
    projectName,
    cicdAccountId,
    prodAccountId,
    region,
});
