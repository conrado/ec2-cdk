import {
  SSMClient,
  SendCommandCommand,
  waitUntilCommandExecuted,
} from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';

import { REGION } from '../lib/constants';

test('Run SSM command and check user-data change', async () => {
  const client = new SSMClient({ region: REGION });

  const params = {
    Filters: [
      {
        Name: 'instance-state-name',
        Values: ['running'],
      },
      {
        Name: 'tag:Name',
        Values: ['ec2'],
      },
    ],
  };

  const ec2Client = new EC2Client({ region: REGION });
  const ec2Command = new DescribeInstancesCommand(params);
  const ec2Response = await ec2Client.send(ec2Command);
  const res = ec2Response.Reservations;
  const InstanceId = res && res[0].Instances && res[0].Instances[0].InstanceId;

  const ssmCommand = new SendCommandCommand({
    InstanceIds: [InstanceId as string],
    DocumentName: 'AWS-RunShellScript',
    Parameters: {
      commands: ['cat /tmp/test.txt'],
    },
  });
  const cmdResult = await client.send(ssmCommand);

  const CommandId = cmdResult.Command && cmdResult.Command.CommandId;
  const cmdRes = await waitUntilCommandExecuted(
    { client, maxWaitTime: 300 },
    { CommandId, InstanceId }
  );
  expect(cmdRes.state).toEqual('SUCCESS');
  expect(cmdRes.reason.StandardOutputContent).toEqual('hello ec2\n');
}, 30000);
