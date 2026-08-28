import { Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Constants } from '../../constants';
import { ArtifactKmsKey } from './artifact-kms-key';

export interface CodeBuildRoleProps {
    kmsKey: ArtifactKmsKey;
    cicdAccountId: string;
    prodAccountId: string;
}

export class CodeBuildRole extends Construct {
    role: Role;

    constructor(scope: Construct, id: string, props: CodeBuildRoleProps) {
        super(scope, id);

        const policy = new ManagedPolicy(this, 'Policy', {
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        'logs:CreateLogGroup',
                        'logs:CreateLogStream',
                        'logs:PutLogEvents',
                        'logs:PutRetentionPolicy',
                    ],
                    resources: ['arn:aws:logs:*'],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        'codeartifact:GetAuthorizationToken',
                        'codeartifact:GetRepositoryEndpoint',
                        'codeartifact:ReadFromRepository',
                        'codeartifact:PublishPackageVersion',
                        'codeartifact:PutPackageMetadata',
                        'codeartifact:ListPackageVersionAssets',
                        'codeartifact:GetPackageVersionAsset',
                    ],
                    resources: ['*'],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['sts:GetServiceBearerToken'],
                    resources: ['*'],
                    conditions: {
                        StringEquals: { 'sts:AWSServiceName': 'codeartifact.amazonaws.com' },
                    },
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        'codebuild:CreateReportGroup',
                        'codebuild:CreateReport',
                        'codebuild:UpdateReport',
                        'codebuild:BatchPutTestCases',
                    ],
                    resources: ['*'],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        'kms:Decrypt',
                        'kms:Encrypt',
                        'kms:ReEncrypt*',
                        'kms:GenerateDataKey*',
                        'kms:DescribeKey',
                    ],
                    resources: [props.kmsKey.key.keyArn],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['ssm:GetParameter'],
                    resources: [
                        `arn:aws:ssm:*:${props.cicdAccountId}:parameter/custom/ami/al2023/*`,
                    ],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['sts:AssumeRole'],
                    resources: [
                        `arn:aws:iam::${props.prodAccountId}:role/${Constants.ASG_CROSS_ACCOUNT_ROLE_NAME}`,
                    ],
                }),
            ],
        });

        this.role = new Role(this, 'Role', {
            roleName: 'asg-rolling-codebuild-service-role',
            assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
                policy,
            ],
        });
    }
}
