import { AccountPrincipal, Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnDomain, CfnRepository } from 'aws-cdk-lib/aws-codeartifact';
import { Construct } from 'constructs';

export interface CodeArtifactRepoProps {
    projectName: string;
    deploymentName: string;
    prodAccountId: string;
}

export class CodeArtifactRepo extends Construct {
    readonly domainName: string;
    readonly repositoryName: string;

    constructor(scope: Construct, id: string, props: CodeArtifactRepoProps) {
        super(scope, id);

        this.domainName = props.projectName;
        this.repositoryName = props.deploymentName;

        const domain = new CfnDomain(this, 'Domain', {
            domainName: this.domainName,
            permissionsPolicyDocument: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        principals: [new AccountPrincipal(props.prodAccountId)],
                        actions: [
                            'codeartifact:GetAuthorizationToken',
                            'codeartifact:GetRepositoryEndpoint',
                            'codeartifact:ReadFromRepository',
                            'codeartifact:ListPackageVersionAssets',
                            'codeartifact:GetPackageVersionAsset',
                        ],
                        resources: ['*'],
                    }),
                ],
            }).toJSON(),
        });

        new CfnRepository(this, 'Repository', {
            domainName: this.domainName,
            repositoryName: this.repositoryName,
            externalConnections: ['public:maven-central'],
        }).addDependency(domain);
    }
}
