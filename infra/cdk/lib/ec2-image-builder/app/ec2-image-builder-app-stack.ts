import * as cdk from 'aws-cdk-lib';
import { AccountPrincipal, Effect, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export const AMI_SSM_WRITER_ROLE_NAME = 'AmiSsmWriterRole';

export interface AmiSsmWriterStackProps extends cdk.StackProps {
    cicdAccountId: string;
}

export class Ec2ImageBuilderAppStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AmiSsmWriterStackProps) {
        super(scope, id, props);

        const { cicdAccountId } = props;

        const role = new Role(this, 'AmiSsmWriterRole', {
            roleName: AMI_SSM_WRITER_ROLE_NAME,
            // Allow any principal in the CICD account to assume this role.
            // The ParameterStoreUpdater Lambda in CICD will assume it to write the custom AMI ID here.
            assumedBy: new AccountPrincipal(cicdAccountId),
        });

        role.addToPolicy(new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['ssm:PutParameter', 'ssm:GetParameter'],
            resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/custom/ami/al2023/*`],
        }));
    }
}