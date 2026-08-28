#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../../lib/ec2-image-builder/CdkStack';

const app = new cdk.App();

const cicdAccountId = process.env.CICD_ACCOUNT_ID!;
const prodAccountId = process.env.PROD_ACCOUNT_ID!;
const region = process.env.CDK_DEFAULT_REGION!;
const projectName = process.env.PROJECT_NAME!;

new CdkStack(app, 'ec2-image-builder-cicd', {
    stackName: 'ec2-image-builder-cicd',
    env: { account: cicdAccountId, region },
    projectName,
    cicdAccountId,
    prodAccountId,
    region,
});
