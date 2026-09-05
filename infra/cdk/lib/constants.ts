export abstract class Constants {
    static readonly ORGANIZATION_ID = process.env.AWS_ORGANIZATION_ID!
    static readonly ORGANIZATION_UNIT_ID = process.env.AWS_ORGANIZATION_UNIT_ID!
    static readonly ARTIFACT_NAME = "app.jar"
    static readonly FARGATE_CROSS_ACCOUNT_ROLE_NAME = 'fargate-cross-account-deploy-role'
    static readonly ASG_CROSS_ACCOUNT_ROLE_NAME = 'asg-rolling-cross-account-deploy-role'
    static readonly EKS_CROSS_ACCOUNT_ROLE_NAME = 'eks-fargate-cross-account-deploy-role'
  }
