import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export class StressParameter extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        new StringParameter(this, 'Parameter', {
            parameterName: '/custom/stress',
            stringValue: 'false',
        });
    }
}
