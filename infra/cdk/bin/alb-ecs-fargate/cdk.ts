#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {FargateAppStack} from '../../lib/alb-ecs-fargate/app/cdk-stack';
import {FargateCicdStack} from '../../lib/alb-ecs-fargate/cicd/cdk-stack';

const app = new cdk.App();

// Cross-account Fargate deployment:
//   alb-ecs-fargate-app  → PROD account (ECS cluster, ALB, cross-account deploy role)
//   alb-ecs-fargate-cicd → CICD account (CodePipeline: build + push ECR + deploy to PROD ECS)
// Deploy order: app first, then cicd.

const fargateApp = 'alb-ecs-fargate-app';
new FargateAppStack(app, fargateApp, {
    stackName: fargateApp,
    env: {
        account: process.env.PROD_ACCOUNT_ID,
        region: process.env.CDK_DEFAULT_REGION,
    }
})

const fargateCicd = 'alb-ecs-fargate-cicd';
new FargateCicdStack(app, fargateCicd, {
    stackName: fargateCicd,
    env: {
        account: process.env.CICD_ACCOUNT_ID,
        region: process.env.CDK_DEFAULT_REGION,
    }
})