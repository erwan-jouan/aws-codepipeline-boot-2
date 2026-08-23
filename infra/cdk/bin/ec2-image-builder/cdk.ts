#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../../lib/ec2-image-builder/CdkStack';

const app = new cdk.App();

new CdkStack(app, 'ec2-image-builder-cicd', {
    stackName: 'ec2-image-builder-cicd',
    env: {
        account: process.env.CICD_ACCOUNT_ID,
        region: process.env.CDK_DEFAULT_REGION,
  }
});