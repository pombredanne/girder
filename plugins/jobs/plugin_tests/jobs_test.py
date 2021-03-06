#!/usr/bin/env python
# -*- coding: utf-8 -*-

###############################################################################
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
###############################################################################

import time

from tests import base
from girder import events


JobStatus = None

def setUpModule():
    base.enabledPlugins.append('jobs')
    base.startServer()

    global JobStatus
    from girder.plugins.jobs.constants import JobStatus


def tearDownModule():
    base.stopServer()


class JobsTestCase(base.TestCase):
    def setUp(self):
        base.TestCase.setUp(self)

        self.users = [self.model('user').createUser(
            'usr' + str(n), 'passwd', 'tst', 'usr', 'u{}@u.com'.format(n))
            for n in range(3)]

    def testJobs(self):
        self.job = None
        def schedule(event):
            self.job = event.info
            self.job['status'] = JobStatus.RUNNING
            self.model('job', 'jobs').save(self.job)
            self.assertEqual(self.job['args'], ('hello', 'world'))
            self.assertEqual(self.job['kwargs'], {'a': 'b'})

        events.bind('jobs.schedule', 'test', schedule)

        # Create a job
        job = self.model('job', 'jobs').createJob(
            title='Job Title', type='my_type', args=('hello', 'world'),
            kwargs={'a': 'b'}, user=self.users[1], handler='my_handler',
            public=False)
        self.assertEqual(self.job, None)
        self.assertEqual(job['status'], JobStatus.INACTIVE)

        # Schedule the job, make sure our handler was invoked
        self.model('job', 'jobs').scheduleJob(job)
        self.assertEqual(self.job['_id'], job['_id'])
        self.assertEqual(self.job['status'], JobStatus.RUNNING)

        # Since the job is not public, user 2 should not have access
        path = '/job/{}'.format(job['_id'])
        resp = self.request(path, user=self.users[2])
        self.assertStatus(resp, 403)
        resp = self.request(path, user=self.users[2], method='PUT')
        self.assertStatus(resp, 403)
        resp = self.request(path, user=self.users[2], method='DELETE')
        self.assertStatus(resp, 403)

        # Make sure user who created the job can see it
        resp = self.request(path, user=self.users[1])
        self.assertStatusOk(resp)

        # We should be able to update the job as the user who created it
        resp = self.request(path, method='PUT', user=self.users[1], params={
            'log': 'My log message\n'
        })
        self.assertStatusOk(resp)

        # We should be able to create a job token and use that to update it too
        token = self.model('job', 'jobs').createJobToken(job)
        resp = self.request(path, method='PUT', params={
            'log': 'append message',
            'token': token['_id']
        })
        self.assertStatusOk(resp)
        self.assertEqual(resp.json['log'], 'My log message\nappend message')

        # Test overwriting the log and updating status
        resp = self.request(path, method='PUT', params={
            'log': 'overwrite',
            'overwrite': 'true',
            'status': JobStatus.SUCCESS,
            'token': token['_id']
        })
        self.assertStatusOk(resp)
        self.assertEqual(resp.json['log'], 'overwrite')
        self.assertEqual(resp.json['status'], JobStatus.SUCCESS)

        # We should be able to delete the job as the user who created it
        resp = self.request(path, user=self.users[1], method='DELETE')
        self.assertStatusOk(resp)
        job = self.model('job', 'jobs').load(job['_id'], force=True)
        self.assertIsNone(job)

    def testListJobs(self):
        job = self.model('job', 'jobs').createJob(
            title='A job', type='t', user=self.users[1], public=False)

        anonJob = self.model('job', 'jobs').createJob(
            title='Anon job', type='t')
        # Ensure timestamp for public job is strictly higher (ms resolution)
        time.sleep(0.1)
        publicJob = self.model('job', 'jobs').createJob(
            title='Anon job', type='t', public=True)

        # User 1 should be able to see their own jobs
        resp = self.request('/job', user=self.users[1], params={
            'userId': self.users[1]['_id']
        })
        self.assertStatusOk(resp)
        self.assertEqual(len(resp.json), 1)
        self.assertEqual(resp.json[0]['_id'], str(job['_id']))

        # User 2 should not see user 1's jobs in the list
        resp = self.request('/job', user=self.users[2], params={
            'userId': self.users[1]['_id']
        })
        self.assertEqual(resp.json, [])

        # Omitting a userId should assume current user
        resp = self.request('/job', user=self.users[1])
        self.assertStatusOk(resp)
        self.assertEqual(len(resp.json), 1)
        self.assertEqual(resp.json[0]['_id'], str(job['_id']))

        # Explicitly passing "None" should show anonymous jobs
        resp = self.request('/job', user=self.users[0], params={
            'userId': 'none'
        })
        self.assertStatusOk(resp)
        self.assertEqual(len(resp.json), 2)
        self.assertEqual(resp.json[0]['_id'], str(publicJob['_id']))
        self.assertEqual(resp.json[1]['_id'], str(anonJob['_id']))

        # Non-admins should only see public anon jobs
        resp = self.request('/job', params={'userId': 'none'})
        self.assertStatusOk(resp)
        self.assertEqual(len(resp.json), 1)
        self.assertEqual(resp.json[0]['_id'], str(publicJob['_id']))

    def testFiltering(self):
        job = self.model('job', 'jobs').createJob(
            title='A job', type='t', user=self.users[1], public=True)

        job['_some_other_field'] = 'foo'
        job = self.model('job', 'jobs').save(job)

        resp = self.request('/job/{}'.format(job['_id']))
        self.assertStatusOk(resp)
        self.assertTrue('created' in resp.json)
        self.assertTrue('_some_other_field' not in resp.json)

        def filterJob(event):
            event.info['job']['_some_other_field'] = 'bar'
            event.addResponse({
                'exposeFields': ['_some_other_field'],
                'removeFields': ['created']
            })

        events.bind('jobs.filter', 'test', filterJob)

        resp = self.request('/job/{}'.format(job['_id']))
        self.assertStatusOk(resp)
        self.assertEqual(resp.json['_some_other_field'], 'bar')
        self.assertTrue('created' not in resp.json)
