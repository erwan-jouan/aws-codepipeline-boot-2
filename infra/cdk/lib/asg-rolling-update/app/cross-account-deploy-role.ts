import { AccountPrincipal, Effect, ManagedPolicy, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Constants } from '../../constants';

export class CrossAccountDeployRole extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const policy = new ManagedPolicy(this, 'Policy', {
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        'autoscaling:StartInstanceRefresh',
                        'autoscaling:DescribeInstanceRefreshes',
                        'autoscaling:DescribeAutoScalingGroups',
                        'autoscaling:UpdateAutoScalingGroup',
                    ],
                    resources: ['*'],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        'ec2:DescribeLaunchTemplates',
                        'ec2:DescribeLaunchTemplateVersions',
                        'ec2:CreateLaunchTemplateVersion',
                    ],
                    resources: ['*'],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['ec2:RunInstances'],
                    resources: [
                        'arn:aws:ec2:*:*:launch-template/*',
                        'arn:aws:ec2:*:*:instance/*',
                        'arn:aws:ec2:*:*:volume/*',
                        'arn:aws:ec2:*:*:network-interface/*',
                        'arn:aws:ec2:*:*:subnet/*',
                        'arn:aws:ec2:*:*:security-group/*',
                        'arn:aws:ec2:*::image/*',
                    ],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['iam:PassRole'],
                    resources: ['arn:aws:iam::*:role/*'],
                    conditions: {
                        StringEquals: { 'iam:PassedToService': 'ec2.amazonaws.com' },
                    },
                }),
            ],
        });

        new Role(this, 'Role', {
            roleName: Constants.ASG_CROSS_ACCOUNT_ROLE_NAME,
            assumedBy: new AccountPrincipal(process.env.CICD_ACCOUNT_ID),
            managedPolicies: [policy],
        });
    }
}
