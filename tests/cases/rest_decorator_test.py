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

from .. import base

from girder.api.rest import endpoint


def setUpModule():
    base.startServer()


def tearDownModule():
    base.stopServer()


class testEndpointDecoratorException(base.TestCase):
    'Tests the endpoint decorator exception handling'

    @endpoint
    def pointless_endpoint_ascii(self, path, params):
        raise Exception('You did something wrong.')

    @endpoint
    def pointless_endpoint_unicode(self, path, params):
        raise Exception(u'\u0400 cannot be converted to ascii.')

    @endpoint
    def pointless_endpoint_bytes(self, path, params):
        raise Exception('\x80\x80 cannot be converted to unicode or ascii.')

    def test_endpoint_exception_ascii(self):
        resp = self.pointless_endpoint_ascii('', {})
        obj = json.loads(resp)
        self.assertEquals(obj['type'], 'internal')

    def test_endpoint_exception_unicode(self):
        resp = self.pointless_endpoint_unicode('', {})
        obj = json.loads(resp)
        self.assertEquals(obj['type'], 'internal')

    def test_endpoint_exception_bytes(self):
        resp = self.pointless_endpoint_bytes('', {})
        print resp
        obj = json.loads(resp)
        self.assertEquals(obj['type'], 'internal')
