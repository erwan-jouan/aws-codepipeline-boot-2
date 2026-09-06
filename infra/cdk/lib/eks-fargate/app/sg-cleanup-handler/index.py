import boto3
import logging
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ec2 = boto3.client('ec2')
elbv2 = boto3.client('elbv2')


def _tagged_with_cluster(resource_arns, cluster_name):
    """Return the subset of ARNs whose elbv2.k8s.aws/cluster tag matches cluster_name."""
    if not resource_arns:
        return []
    tags_resp = elbv2.describe_tags(ResourceArns=resource_arns)
    matched = []
    for desc in tags_resp['TagDescriptions']:
        tags = {t['Key']: t['Value'] for t in desc['Tags']}
        if tags.get('elbv2.k8s.aws/cluster') == cluster_name:
            matched.append(desc['ResourceArn'])
    return matched


def delete_load_balancers(cluster_name):
    all_lbs = elbv2.describe_load_balancers()['LoadBalancers']
    all_arns = [lb['LoadBalancerArn'] for lb in all_lbs]
    to_delete = _tagged_with_cluster(all_arns, cluster_name)
    for arn in to_delete:
        try:
            elbv2.delete_load_balancer(LoadBalancerArn=arn)
            logger.info('Deleted load balancer %s', arn)
        except Exception as e:
            logger.warning('Error deleting LB %s: %s', arn, e)
    if to_delete:
        waiter = elbv2.get_waiter('load_balancers_deleted')
        waiter.wait(LoadBalancerArns=to_delete)
        logger.info('All load balancers confirmed deleted')


def delete_target_groups(cluster_name):
    all_tgs = elbv2.describe_target_groups()['TargetGroups']
    all_arns = [tg['TargetGroupArn'] for tg in all_tgs]
    to_delete = _tagged_with_cluster(all_arns, cluster_name)
    for arn in to_delete:
        try:
            elbv2.delete_target_group(TargetGroupArn=arn)
            logger.info('Deleted target group %s', arn)
        except Exception as e:
            logger.warning('Error deleting TG %s: %s', arn, e)


def remove_load_balancer_sg_rule(cluster_name):
    """Remove port-8080 ingress rules that EKS cluster SGs have referencing the ALB SGs."""
    sgs = ec2.describe_security_groups(Filters=[
        {'Name': 'tag:aws:eks:cluster-name', 'Values': [cluster_name]},
        {'Name': 'tag:kubernetes.io/cluster/' + cluster_name, 'Values': ['owned']},
    ])
    for sg in sgs['SecurityGroups']:
        try:
            rules = ec2.describe_security_group_rules(
                Filters=[{'Name': 'group-id', 'Values': [sg['GroupId']]}]
            )
            rule_ids = [
                r['SecurityGroupRuleId'] for r in rules['SecurityGroupRules']
                if not r['IsEgress']
                and r['IpProtocol'] == 'tcp'
                and r.get('FromPort') == 8080
                and r.get('ToPort') == 8080
            ]
            if rule_ids:
                ec2.revoke_security_group_ingress(GroupId=sg['GroupId'], SecurityGroupRuleIds=rule_ids)
                logger.info('Revoked rules %s from %s', rule_ids, sg['GroupId'])
        except Exception as e:
            logger.warning('Error processing sg %s: %s', sg['GroupId'], e)


def purge_alb_security_groups(cluster_name):
    """Clear all rules from and delete every SG tagged with elbv2.k8s.aws/cluster."""
    sgs = ec2.describe_security_groups(Filters=[
        {'Name': 'tag:elbv2.k8s.aws/cluster', 'Values': [cluster_name]},
    ])
    for sg in sgs['SecurityGroups']:
        sg_id = sg['GroupId']
        try:
            rules = ec2.describe_security_group_rules(
                Filters=[{'Name': 'group-id', 'Values': [sg_id]}]
            )
            ingress_ids = [r['SecurityGroupRuleId'] for r in rules['SecurityGroupRules'] if not r['IsEgress']]
            egress_ids  = [r['SecurityGroupRuleId'] for r in rules['SecurityGroupRules'] if r['IsEgress']]
            if ingress_ids:
                ec2.revoke_security_group_ingress(GroupId=sg_id, SecurityGroupRuleIds=ingress_ids)
            if egress_ids:
                ec2.revoke_security_group_egress(GroupId=sg_id, SecurityGroupRuleIds=egress_ids)
        except Exception as e:
            logger.warning('Error clearing rules from %s: %s', sg_id, e)
        try:
            ec2.delete_security_group(GroupId=sg_id)
            logger.info('Deleted security group %s', sg_id)
        except Exception as e:
            logger.warning('Error deleting sg %s: %s', sg_id, e)


def handler(event, context):
    logger.info('Event: %s', event)
    cluster_name = event['ResourceProperties']['ClusterName']
    if event['RequestType'] == 'Delete':
        delete_load_balancers(cluster_name)   # waits for deletion to complete
        delete_target_groups(cluster_name)
        remove_load_balancer_sg_rule(cluster_name)
        purge_alb_security_groups(cluster_name)
    return {'PhysicalResourceId': 'sg-cleanup-' + cluster_name}
