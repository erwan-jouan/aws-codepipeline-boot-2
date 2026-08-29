import { InstanceProfile, ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class Ec2InstanceProfile extends Construct {

    role: Role;
    name: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        this.role = new Role(this, 'myRole', {
            assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
            roleName: "ec2-image-builder-role",
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName("EC2InstanceProfileForImageBuilder"),
                ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy"),
            ]
        });

        const instanceProfile = new InstanceProfile(this, 'instanceProfile', {
            role: this.role
        });

        this.name = instanceProfile.instanceProfileName;
    }
}
