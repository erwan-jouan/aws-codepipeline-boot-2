import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface SgCleanupProps {
    vpc: ec2.Vpc;
    clusterName: string;
}

export class SgCleanup extends Construct {
    constructor(scope: Construct, id: string, props: SgCleanupProps) {
        super(scope, id);

        const fn = new lambda.Function(this, 'Handler', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, 'sg-cleanup-handler')),
            timeout: cdk.Duration.minutes(5),
        });

        fn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ec2:DescribeSecurityGroups',
                'ec2:DescribeSecurityGroupRules',
                'ec2:RevokeSecurityGroupIngress',
                'ec2:RevokeSecurityGroupEgress',
                'ec2:DeleteSecurityGroup',
            ],
            resources: ['*'],
        }));

        const provider = new cr.Provider(this, 'Provider', {
            onEventHandler: fn,
        });

        const resource = new cdk.CustomResource(this, 'Resource', {
            serviceToken: provider.serviceToken,
            properties: {
                ClusterName: props.clusterName,
            },
        });

        // On deletion CloudFormation removes this resource before the VPC,
        // so the cleanup Lambda always runs while the VPC still exists.
        resource.node.addDependency(props.vpc);
    }
}