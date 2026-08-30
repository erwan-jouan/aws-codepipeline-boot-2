import { Duration } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { Vpc } from './vpc';

export class Alb extends Construct {
    readonly targetGroup: ApplicationTargetGroup;
    readonly securityGroup: SecurityGroup;
    readonly dnsName: string;

    constructor(scope: Construct, id: string, appVpc: Vpc) {
        super(scope, id);

        this.securityGroup = new SecurityGroup(this, 'AlbSg', {
            vpc: appVpc.vpc,
            description: 'ALB: allow HTTP from internet',
        });
        this.securityGroup.addIngressRule(Peer.anyIpv4(), Port.HTTP, 'HTTP from internet');

        const alb = new ApplicationLoadBalancer(this, 'Alb', {
            vpc: appVpc.vpc,
            internetFacing: true,
            securityGroup: this.securityGroup,
            vpcSubnets: { subnetType: SubnetType.PUBLIC },
        });

        this.targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
            vpc: appVpc.vpc,
            port: 8080,
            protocol: ApplicationProtocol.HTTP,
            targetType: TargetType.INSTANCE,
            healthCheck: {
                path: '/actuator/health',
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                timeout: Duration.seconds(5),
                interval: Duration.seconds(30),
            },
        });

        alb.addListener('HttpListener', {
            port: 80,
            defaultTargetGroups: [this.targetGroup],
        });

        this.dnsName = alb.loadBalancerDnsName;
    }
}
