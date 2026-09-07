import boto3
import logging
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ec2 = boto3.client('ec2')
elbv2 = boto3.client('elbv2')


def _tagged_with_cluster(resource_arns, cluster_name):
    """Return the subset of ARNs whose elbv2.k8s.aws/cluster tag matches cluster_name.

    describe_tags accepts at most 20 ARNs per call — batch accordingly.
    """
    matched = []
    for i in range(0, len(resource_arns), 20):
        chunk = resource_arns[i:i + 20]
        for desc in elbv2.describe_tags(ResourceArns=chunk)['TagDescriptions']:
            tags = {t['Key']: t['Value'] for t in desc['Tags']}
            if tags.get('elbv2.k8s.aws/cluster') == cluster_name:
                matched.append(desc['ResourceArn'])
    return matched


def _all_lb_arns():
    """Return every load-balancer ARN in the account (paginated)."""
    paginator = elbv2.get_paginator('describe_load_balancers')
    arns = []
    for page in paginator.paginate():
        arns.extend(lb['LoadBalancerArn'] for lb in page['LoadBalancers'])
    return arns


def _all_tg_arns():
    """Return every target-group ARN in the account (paginated)."""
    paginator = elbv2.get_paginator('describe_target_groups')
    arns = []
    for page in paginator.paginate():
        arns.extend(tg['TargetGroupArn'] for tg in page['TargetGroups'])
    return arns


def delete_load_balancers(cluster_name):
    to_delete = _tagged_with_cluster(_all_lb_arns(), cluster_name)
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
    for arn in _tagged_with_cluster(_all_tg_arns(), cluster_name):
        try:
            elbv2.delete_target_group(TargetGroupArn=arn)
            logger.info('Deleted target group %s', arn)
        except Exception as e:
            logger.warning('Error deleting TG %s: %s', arn, e)


def _get_alb_sg_ids(cluster_name):
    """Return all SG IDs tagged with elbv2.k8s.aws/cluster for this cluster."""
    return {
        sg['GroupId']
        for sg in ec2.describe_security_groups(Filters=[
            {'Name': 'tag:elbv2.k8s.aws/cluster', 'Values': [cluster_name]},
        ])['SecurityGroups']
    }


def remove_external_references(alb_sg_ids):
    """Remove ingress and egress rules in non-ALB SGs that reference any ALB SG."""
    for sg_id in alb_sg_ids:
        # Ingress rules in other SGs that allow FROM this SG
        try:
            for ref_sg in ec2.describe_security_groups(Filters=[
                {'Name': 'ip-permission.group-id', 'Values': [sg_id]},
            ])['SecurityGroups']:
                if ref_sg['GroupId'] in alb_sg_ids:
                    continue
                rules = ec2.describe_security_group_rules(
                    Filters=[{'Name': 'group-id', 'Values': [ref_sg['GroupId']]}]
                )['SecurityGroupRules']
                to_revoke = [
                    r['SecurityGroupRuleId'] for r in rules
                    if not r['IsEgress']
                    and r.get('ReferencedGroupInfo', {}).get('GroupId') == sg_id
                ]
                if to_revoke:
                    ec2.revoke_security_group_ingress(GroupId=ref_sg['GroupId'], SecurityGroupRuleIds=to_revoke)
                    logger.info('Revoked %d ingress rule(s) referencing %s from %s',
                                len(to_revoke), sg_id, ref_sg['GroupId'])
        except Exception as e:
            logger.warning('Error removing ingress references to %s: %s', sg_id, e)

        # Egress rules in other SGs that allow TO this SG
        try:
            for ref_sg in ec2.describe_security_groups(Filters=[
                {'Name': 'egress.ip-permission.group-id', 'Values': [sg_id]},
            ])['SecurityGroups']:
                if ref_sg['GroupId'] in alb_sg_ids:
                    continue
                rules = ec2.describe_security_group_rules(
                    Filters=[{'Name': 'group-id', 'Values': [ref_sg['GroupId']]}]
                )['SecurityGroupRules']
                to_revoke = [
                    r['SecurityGroupRuleId'] for r in rules
                    if r['IsEgress']
                    and r.get('ReferencedGroupInfo', {}).get('GroupId') == sg_id
                ]
                if to_revoke:
                    ec2.revoke_security_group_egress(GroupId=ref_sg['GroupId'], SecurityGroupRuleIds=to_revoke)
                    logger.info('Revoked %d egress rule(s) referencing %s from %s',
                                len(to_revoke), sg_id, ref_sg['GroupId'])
        except Exception as e:
            logger.warning('Error removing egress references to %s: %s', sg_id, e)


def detach_from_enis(alb_sg_ids):
    """Remove ALB SGs from any ENI that still has them attached (e.g. Fargate pod ENIs).

    The LB controller attaches the backend SG to pod ENIs for target routing.
    Those ENIs outlive the ALB deletion and block SG cleanup.
    """
    for sg_id in alb_sg_ids:
        try:
            enis = ec2.describe_network_interfaces(Filters=[
                {'Name': 'group-id', 'Values': [sg_id]},
            ])['NetworkInterfaces']
            for eni in enis:
                eni_id = eni['NetworkInterfaceId']
                remaining = [g['GroupId'] for g in eni['Groups'] if g['GroupId'] != sg_id]
                if not remaining:
                    logger.warning('ENI %s would have no SGs after removing %s — skipping', eni_id, sg_id)
                    continue
                ec2.modify_network_interface_attribute(NetworkInterfaceId=eni_id, Groups=remaining)
                logger.info('Removed %s from ENI %s', sg_id, eni_id)
        except Exception as e:
            logger.warning('Error detaching %s from ENIs: %s', sg_id, e)


def purge_alb_security_groups(alb_sg_ids):
    """Clear all rules from and delete every ALB-tagged SG, retrying on DependencyViolation."""
    for sg_id in alb_sg_ids:
        try:
            rules = ec2.describe_security_group_rules(
                Filters=[{'Name': 'group-id', 'Values': [sg_id]}]
            )['SecurityGroupRules']
            ingress_ids = [r['SecurityGroupRuleId'] for r in rules if not r['IsEgress']]
            egress_ids  = [r['SecurityGroupRuleId'] for r in rules if r['IsEgress']]
            if ingress_ids:
                ec2.revoke_security_group_ingress(GroupId=sg_id, SecurityGroupRuleIds=ingress_ids)
            if egress_ids:
                ec2.revoke_security_group_egress(GroupId=sg_id, SecurityGroupRuleIds=egress_ids)
        except Exception as e:
            logger.warning('Error clearing rules from %s: %s', sg_id, e)

        # Retry with backoff — ENIs may still be terminating after detach
        for attempt in range(4):
            try:
                ec2.delete_security_group(GroupId=sg_id)
                logger.info('Deleted security group %s', sg_id)
                break
            except Exception as e:
                if 'DependencyViolation' in str(e) and attempt < 3:
                    wait = 15 * (2 ** attempt)   # 15 s → 30 s → 60 s
                    logger.info('DependencyViolation on %s, retrying in %ds (attempt %d/4)',
                                sg_id, wait, attempt + 1)
                    time.sleep(wait)
                else:
                    logger.warning('Error deleting sg %s: %s', sg_id, e)
                    break


def handler(event, context):
    logger.info('Event: %s', event)
    cluster_name = event['ResourceProperties']['ClusterName']
    if event['RequestType'] == 'Delete':
        delete_load_balancers(cluster_name)       # waits for deletion to complete
        delete_target_groups(cluster_name)
        alb_sg_ids = _get_alb_sg_ids(cluster_name)
        remove_external_references(alb_sg_ids)    # revokes cross-SG rules (ingress + egress)
        detach_from_enis(alb_sg_ids)              # removes SGs from Fargate pod ENIs
        purge_alb_security_groups(alb_sg_ids)     # clears own rules, deletes with retry
    return {'PhysicalResourceId': 'sg-cleanup-' + cluster_name}
