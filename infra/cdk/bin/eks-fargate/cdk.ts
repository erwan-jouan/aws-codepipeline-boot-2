#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EksFargateAppStack } from '../../lib/eks-fargate/app/cdk-stack';
import { EksFargateCicdStack } from '../../lib/eks-fargate/cicd/cdk-stack';

const app = new cdk.App();

// Cross-account EKS Fargate deployment:
//   eks-fargate-app  → PROD account (EKS cluster, Fargate profiles, LB controller, cross-account deploy role)
//   eks-fargate-cicd → CICD account (CodePipeline: build Docker image + deploy to EKS via kubectl)
// Deploy order: app first, then cicd.

const eksApp = 'eks-fargate-app';
new EksFargateAppStack(app, eksApp, {
    stackName: eksApp,
    env: {
        account: process.env.PROD_ACCOUNT_ID,
        region: process.env.CDK_DEFAULT_REGION,
    },
});

const eksCicd = 'eks-fargate-cicd';
new EksFargateCicdStack(app, eksCicd, {
    stackName: eksCicd,
    env: {
        account: process.env.CICD_ACCOUNT_ID,
        region: process.env.CDK_DEFAULT_REGION,
    },
});