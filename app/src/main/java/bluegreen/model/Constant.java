package bluegreen.model;

public final class Constant {
    private Constant() {
        throw new IllegalStateException("Utility class");
    }

    public static final String PROJECT_NAME = "aws-codepipeline-boot-2";
    public static final String ALB_ECS_FARGATE_PROFILE = "alb-ecs-fargate";
    public static final String ALB_ECS_EC2_PROFILE = "alb-ecs-ec2";
    public static final String ASG_CODE_DEPLOY_EC2_PROFILE = "asg-codedeploy-ec2";
    public static final String ASG_ROLLING_UPDATE_PROFILE = "asg-rolling-update";
    public static final String ASG_LIFECYCLE_HOOK_PROFILE = "asg-lifecycle-hook";
    public static final String ASG_EC2_IMAGE_BUILDER_PROFILE = "asg-ec2-image-builder";
    public static final String CLOUDFRONT_PROFILE = "cloudfront";
    public static final String API_GW_LAMBDA_PROFILE = "api-gw-lambda";
    public static final String APPRUNNER_CONTAINER_PROFILE = "apprunner-container";
    public static final String BLUE_GREEN_ECS_FARGATE_PROFILE = "bluegreen-ecs-fargate";
    public static final String COGNITO_SOCIAL_IDP_PROFILE = "cognito-social-idp";
    public static final String DISASTER_RECOVERY_PROFILE = "disaster-recovery";
    public static final String DYNAMODB_LAMBDA_PROFILE = "dynamodb-lambda";
    public static final String EB_EC2_JAR_PROFILE = "eb-ec2-jar";
    public static final String EB_SINGLE_DOCKER_PROFILE = "eb-single-docker";
    public static final String EB_MULTI_DOCKER_PROFILE = "eb-multi-docker";
    public static final String EKS_FARGATE_PROFILE = "eks-fargate";
    public static final String LIGHTSAIL_CONTAINER_PROFILE = "lightsail-container";
    public static final String OPSWORKS_STACKS_PROFILE = "opsworks-stacks";
    public static final String NON_COGNITO_SOCIAL_IDP_PROFILE = "!" + COGNITO_SOCIAL_IDP_PROFILE;
    public static final String PROJECT_DEPLOYMENT_NAME_ENV = "${PROJECT_DEPLOYMENT_NAME}";
    public static final String SAM_LAMBDA_JAR_PROFILE = "sam-lambda-jar";
    public static final String PR_ECS_FARGATE_PROFILE = "pr-ecs-fargate";
    public static final String AWS_DEFAULT_REGION_ENV = "${AWS_DEFAULT_REGION}";
    public static final String EKS_HOSTNAME = "${HOSTNAME}";
    public static final String DYNAMODB_TABLE_NAME = "Exam";
    // Dynamo

    public static final String PARENT = "Parent";
    public static final String ID = "Id";
    public static final String NAME = "Name";
    public static final String LABEL = "Label";
    public static final String IS_SKILL = "IsSkill";

    public static final String DOMAINS_TABLE = "Domains";
    public static final String TASK_STATEMENTS_TABLE = "TaskStatements";
    public static final String KNOWLEDGES_OF_TABLE = "KnowledgesOf";
    public static final String SKILLS_IN_TABLE = "SkillsIn";

    public static final String TASK_STATEMENTS_FILE = ".dynamodb.taskStatements.json";
    public static final String DOMAINS_FILE = ".dynamodb.domains.json";
    public static final String SKILLS_IN_FILE = ".dynamodb.skillsIn.json";
    public static final String KNOWLEDGES_OF_FILE = ".dynamodb.knowledgesOf.json";
    public static final String GSI_PARENT_INDEX_NAME = "ParentIndex";

    public static final String BASE_API_METHOD = "/api";
}
