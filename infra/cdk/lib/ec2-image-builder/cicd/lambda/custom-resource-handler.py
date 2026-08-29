import boto3
import logging as log

log.getLogger().setLevel(log.INFO)


def put_ssm_parameter(ssm_client, name, value):
    ssm_client.put_parameter(
        Name=name,
        Value=value,
        Type='String',
        Overwrite=True,
        DataType='text',
    )
    log.info('%s successfully written to %s', value, name)


def main(event, context):
    log.info('Input event: %s', event)

    if event['RequestType'] not in ['Create', 'Update']:
        return {'Data': {'Response': 'no op'}}

    props = event['ResourceProperties']
    parameter_store_name = props['ParameterStoreName']
    ami_id = props['AmiId']
    prod_writer_role_arn = props.get('ProdWriterRoleArn')

    log.info('parameterStoreName %s', parameter_store_name)
    log.info('amiId %s', ami_id)

    # Write to CICD account SSM (local)
    put_ssm_parameter(boto3.client('ssm'), parameter_store_name, ami_id)

    # Write to PROD account SSM via cross-account role
    if prod_writer_role_arn:
        log.info('Assuming role %s to write SSM parameter in PROD account', prod_writer_role_arn)
        sts = boto3.client('sts')
        assumed = sts.assume_role(RoleArn=prod_writer_role_arn, RoleSessionName='AmiSsmWriter')
        creds = assumed['Credentials']
        prod_ssm = boto3.client(
            'ssm',
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'],
        )
        put_ssm_parameter(prod_ssm, parameter_store_name, ami_id)

    message = '{} successfully written to {} in CICD and PROD accounts'.format(ami_id, parameter_store_name)
    return {'Data': {'Response': message}}
