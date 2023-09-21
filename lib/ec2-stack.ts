import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Instance, IpAddresses } from 'aws-cdk-lib/aws-ec2';
import { REGION } from './constants';

export class EC2Stack extends cdk.Stack {
  public ec2Instance: Instance;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'EC2', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'asterisk',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
      vpc,
      description: 'Allow HTTP ingress',
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'allow HTTP access from the world'
    );

    const ami = ec2.MachineImage.lookup({
      name: 'ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-*',
      owners: ['099720109477'],
      filters: {
        architecture: ['arm64'],
        'virtualization-type': ['hvm'],
        'root-device-type': ['ebs'],
      },
    });

    const role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    this.ec2Instance = new ec2.Instance(this, 'EC2Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ami,
      securityGroup,
      role,
    });

    cdk.Tags.of(this.ec2Instance).add('Name', 'ec2');

    this.ec2Instance.addUserData(
      'sudo apt update && sudo apt -y install nginx && sudo systemctl enable nginx && sudo systemctl start nginx'
    );
    this.ec2Instance.addUserData('echo "hello ec2" > /tmp/test.txt');

    new cdk.CfnOutput(this, 'HttpEndpoint', {
      value: `http://${this.ec2Instance.instancePublicIp}`,
    });
    new cdk.CfnOutput(this, 'Connect Command', {
      value: `aws --region ${REGION} ssm start-session --target ${this.ec2Instance.instanceId}`,
    });
  }
}
