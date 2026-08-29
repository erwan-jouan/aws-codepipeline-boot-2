import { Duration } from 'aws-cdk-lib';
import { ScalingProcess, UpdatePolicy } from 'aws-cdk-lib/aws-autoscaling';
import { AutoScalingGroup, HealthCheck } from 'aws-cdk-lib/aws-autoscaling';
import { InstanceType, MachineImage, SubnetType, UserData } from 'aws-cdk-lib/aws-ec2';
import { ApplicationTargetGroup } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Role } from 'aws-cdk-lib/aws-iam';
import { SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { Constants } from '../../constants';
import { Ec2Architecture } from '../../utils/ec2-architecture';
import { Vpc } from './vpc';

export interface AsgProps {
    appVpc: Vpc;
    targetGroup: ApplicationTargetGroup;
    role: Role;
    webappSg: SecurityGroup;
    architecture: Ec2Architecture;
    projectName: string;
    deploymentName: string;
    cicdAccountId: string;
    projectDeploymentName: string;
}

export class Asg extends Construct {
    readonly asgName: string;

    constructor(scope: Construct, id: string, props: AsgProps) {
        super(scope, id);

        const { projectName, deploymentName, cicdAccountId, projectDeploymentName, appVpc, targetGroup, role, webappSg, architecture } = props;
        const artifactDomain = projectName;
        const artifactRepo = deploymentName;

        const userData = UserData.forLinux();
        userData.addCommands(
            `export CODEARTIFACT_AUTH_TOKEN=$(aws codeartifact get-authorization-token --domain ${artifactDomain} --domain-owner ${cicdAccountId} --query authorizationToken --output text)`,
            `export ASSET_NAME=$(aws codeartifact list-package-version-assets --domain ${artifactDomain} --domain-owner ${cicdAccountId} --repository ${artifactRepo} --format maven --namespace com.the.atomicity --package ${projectName} --package-version 0.0.1-SNAPSHOT --query 'assets[?ends_with(name, \`.jar\`)==\`true\`].name' --output text)`,
            `aws codeartifact get-package-version-asset --domain ${artifactDomain} --domain-owner ${cicdAccountId} --repository ${artifactRepo} --format maven --namespace com.the.atomicity --package ${projectName} --package-version 0.0.1-SNAPSHOT --asset $ASSET_NAME /tmp/${Constants.ARTIFACT_NAME}`,
            `java -jar -Dspring.profiles.active=${deploymentName} /tmp/${Constants.ARTIFACT_NAME} > /tmp/${projectName}.log 2>&1 </dev/null &`,
        );

        const asg = new AutoScalingGroup(this, 'Asg', {
            vpc: appVpc.vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            machineImage: MachineImage.fromSsmParameter(architecture.getCustomAmiParameterStoreName()),
            instanceType: new InstanceType(Ec2Architecture.X86_64.instanceType),
            role,
            securityGroup: webappSg,
            userData,
            autoScalingGroupName: projectDeploymentName,
            minCapacity: 2,
            maxCapacity: 4,
            healthCheck: HealthCheck.elb({ grace: Duration.minutes(5) }),
            updatePolicy: UpdatePolicy.rollingUpdate({
                maxBatchSize: 2,
                minInstancesInService: 2,
                waitOnResourceSignals: false,
                pauseTime: Duration.minutes(5),
                suspendProcesses: [
                    ScalingProcess.HEALTH_CHECK,
                    ScalingProcess.REPLACE_UNHEALTHY,
                    ScalingProcess.AZ_REBALANCE,
                    ScalingProcess.ALARM_NOTIFICATION,
                    ScalingProcess.SCHEDULED_ACTIONS,
                ],
            }),
        });

        asg.attachToApplicationTargetGroup(targetGroup);

        this.asgName = asg.autoScalingGroupName;
    }
}
