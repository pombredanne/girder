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

import json
import os

from subprocess import check_output, CalledProcessError

from .. import base
from girder.api.describe import API_VERSION
from girder.constants import SettingKey, SettingDefault, ROOT_DIR
from girder.utility import config


def setUpModule():
    base.startServer()


def tearDownModule():
    base.stopServer()


class SystemTestCase(base.TestCase):
    """
    Contains tests of the /system API endpoints.
    """

    def setUp(self):
        base.TestCase.setUp(self)

        self.users = [self.model('user').createUser(
            'usr%s' % num, 'passwd', 'tst', 'usr', 'u%s@u.com' % num)
            for num in [0, 1]]

    def tearDown(self):
        # Restore the state of the plugins configuration
        conf = config.getConfig()
        if 'plugins' in conf:
            del conf['plugins']

    def testGetVersion(self):
        usingGit = True
        resp = self.request(path='/system/version', method='GET')
        self.assertEqual(resp.json['apiVersion'], API_VERSION)

        try:
            # Get the current git head
            sha = check_output(
                ['git', 'rev-parse', 'HEAD'],
                cwd=ROOT_DIR
            ).strip()
        except CalledProcessError:
            usingGit = False

        # Ensure a valid response
        self.assertEqual(usingGit, resp.json['git'])
        if usingGit:
            self.assertEqual(resp.json['SHA'], sha)
            self.assertEqual(sha.find(resp.json['shortSHA']), 0)

    def testSettings(self):
        users = self.users

        # Only admins should be able to get or set settings
        for method in ('GET', 'PUT', 'DELETE'):
            resp = self.request(path='/system/setting', method=method, params={
                'key': 'foo',
                'value': 'bar'
            }, user=users[1])
            self.assertStatus(resp, 403)

        # Only valid setting keys should be allowed
        obj = ['oauth', 'geospatial', '_invalid_']
        resp = self.request(path='/system/setting', method='PUT', params={
            'key': 'foo',
            'value': json.dumps(obj)
        }, user=users[0])
        self.assertStatus(resp, 400)
        self.assertEqual(resp.json['field'], 'key')

        # Only a valid JSON list is permitted
        resp = self.request(path='/system/setting', method='PUT', params={
            'list': json.dumps('not_a_list')
        }, user=users[0])
        self.assertStatus(resp, 400)

        # Set a valid setting key
        resp = self.request(path='/system/setting', method='PUT', params={
            'key': SettingKey.PLUGINS_ENABLED,
            'value': json.dumps(obj)
        }, user=users[0])
        self.assertStatusOk(resp)

        # We should now be able to retrieve it
        resp = self.request(path='/system/setting', method='GET', params={
            'key': SettingKey.PLUGINS_ENABLED
        }, user=users[0])
        self.assertStatusOk(resp)
        self.assertEqual(resp.json, obj[:-1])

        # We should now clear the setting
        resp = self.request(path='/system/setting', method='DELETE', params={
            'key': SettingKey.PLUGINS_ENABLED
        }, user=users[0])
        self.assertStatusOk(resp)

        # Setting should now be ()
        setting = self.model('setting').get(SettingKey.PLUGINS_ENABLED)
        self.assertEqual(setting, [])

        # We should be able to ask for a different default
        setting = self.model('setting').get(SettingKey.PLUGINS_ENABLED,
                                            default=None)
        self.assertEqual(setting, None)

        # We should also be able to put several setting using a JSON list
        resp = self.request(path='/system/setting', method='PUT', params={
            'list': json.dumps([
                {'key': SettingKey.PLUGINS_ENABLED, 'value': json.dumps(obj)},
                {'key': SettingKey.COOKIE_LIFETIME, 'value': None},
            ])
        }, user=users[0])
        self.assertStatusOk(resp)

        # We can get a list as well
        resp = self.request(path='/system/setting', method='GET', params={
            'list': json.dumps([
                SettingKey.PLUGINS_ENABLED,
                SettingKey.COOKIE_LIFETIME,
            ])
        }, user=users[0])
        self.assertStatusOk(resp)
        self.assertEqual(resp.json[SettingKey.PLUGINS_ENABLED], obj[:-1])

        # We can get the default values, or ask for no value if the current
        # value is taken from the default
        resp = self.request(path='/system/setting', method='GET', params={
            'key': SettingKey.PLUGINS_ENABLED,
            'default': 'default'
        }, user=users[0])
        self.assertStatusOk(resp)
        self.assertEqual(resp.json, [])

        resp = self.request(path='/system/setting', method='GET', params={
            'key': SettingKey.COOKIE_LIFETIME,
            'default': 'none'
        }, user=users[0])
        self.assertStatusOk(resp)
        self.assertEqual(resp.json, None)

        # But we have to ask for a sensible value in teh default parameter
        resp = self.request(path='/system/setting', method='GET', params={
            'key': SettingKey.COOKIE_LIFETIME,
            'default': 'bad_value'
        }, user=users[0])
        self.assertStatus(resp, 400)

        # Try to set each key in turn to test the validation.  First test with
        # am invalid value, then test with the default value.  If the value
        # 'bad' won't trigger a validation error, the key should be present in
        # the badValues table.
        badValues = {
            SettingKey.EMAIL_FROM_ADDRESS: '',
            SettingKey.SMTP_HOST: '',
            SettingKey.CORS_ALLOW_ORIGIN: {},
            SettingKey.CORS_ALLOW_METHODS: {},
            SettingKey.CORS_ALLOW_HEADERS: {},
        }
        allKeys = dict.fromkeys(SettingDefault.defaults.keys())
        allKeys.update(badValues)
        for key in allKeys:
            resp = self.request(path='/system/setting', method='PUT', params={
                'key': key,
                'value': badValues.get(key, 'bad')
            }, user=users[0])
            self.assertStatus(resp, 400)
            resp = self.request(path='/system/setting', method='PUT', params={
                'key': key,
                'value': SettingDefault.defaults.get(key, '')
            }, user=users[0])
            self.assertStatusOk(resp)

    def testPlugins(self):
        pluginRoot = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                  'test_plugins')
        conf = config.getConfig()
        conf['plugins'] = {'plugin_directory': pluginRoot}

        resp = self.request(
            path='/system/plugins', method='PUT', user=self.users[0],
            params={'plugins': '["has_deps"]'})
        self.assertStatusOk(resp)
        enabled = resp.json['value']
        self.assertEqual(len(enabled), 2)
        self.assertTrue('test_plugin' in enabled)

    def testBadPlugin(self):
        pluginRoot = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                  'test_plugins')
        conf = config.getConfig()
        conf['plugins'] = {'plugin_directory': pluginRoot}
        # Try to enable a good plugin and a bad plugin.  Only the good plugin
        # should be enabled.
        resp = self.request(
            path='/system/plugins', method='PUT', user=self.users[0],
            params={'plugins': '["test_plugin","bad_json","bad_yaml"]'})
        self.assertStatusOk(resp)
        enabled = resp.json['value']
        self.assertEqual(len(enabled), 1)
        self.assertTrue('test_plugin' in enabled)
        self.assertTrue('bad_json' not in enabled)
        self.assertTrue('bad_yaml' not in enabled)

    def testRestart(self):
        resp = self.request(path='/system/restart', method='PUT',
                            user=self.users[0])
        self.assertStatusOk(resp)
