import * as cdk from 'aws-cdk-lib';
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Alb } from './alb';
import { Asg } from './asg';
import { CrossAccountDeployRole } from './cross-account-deploy-role';
import { Ec2Role } from './ec2-role';
import { Vpc } from './vpc';
import { WebappSg } from './webapp-sg';
import { Ec2Architecture } from '../../utils/ec2-architecture';

export interface AsgRollingAppProps extends cdk.StackProps {
    projectName: string;
    deploymentName: string;
    projectDeploymentName: string;
    cicdAccountId: string;
}

export class AsgRollingAppStack extends Stack {
    constructor(scope: Construct, id: string, props: AsgRollingAppProps) {
        super(scope, id, props);

        const vpc = new Vpc(this, 'vpc');
        const alb = new Alb(this, 'alb', vpc);
        const ec2Role = new Ec2Role(this, 'ec2Role');
        const webappSg = new WebappSg(this, 'webappSg', vpc.vpc, alb.securityGroup);
        const architecture = Ec2Architecture.X86_64;
        new Asg(this, 'asg', {
            appVpc: vpc,
            targetGroup: alb.targetGroup,
            role: ec2Role.role,
            webappSg: webappSg.securityGroup,
            architecture,
            projectName: props.projectName,
            deploymentName: props.deploymentName,
            cicdAccountId: props.cicdAccountId,
            projectDeploymentName: props.projectDeploymentName,
        });
        new CrossAccountDeployRole(this, 'crossAccountDeployRole', { cicdAccountId: props.cicdAccountId });
    }
}
