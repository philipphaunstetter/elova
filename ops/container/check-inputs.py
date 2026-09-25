#!/usr/bin/env python3
"""Offline syntax gate, not proof of image provenance, ACLs, or host readiness."""
import ipaddress
import os
import re
import sys

image = os.environ.get('ELOVA_BACKEND_IMAGE', '')
ip = os.environ.get('ELOVA_TAILNET_IP', '')
secrets_dir = os.environ.get('ELOVA_SECRETS_DIR', '')

try:
    address = ipaddress.IPv4Address(ip)
except ipaddress.AddressValueError:
    sys.exit('Expected a Tailnet IPv4 address')
if address not in ipaddress.IPv4Network('100.64.0.0/10'):
    sys.exit('Expected a Tailnet IPv4 address')
if not re.fullmatch(r'(?:[a-zA-Z0-9][a-zA-Z0-9./:_-]*@)?sha256:[a-f0-9]{64}', image):
    sys.exit('Expected a verified immutable image digest or locally verified image ID')
if not secrets_dir.startswith('/') or '/..' in secrets_dir or secrets_dir == '/':
    sys.exit('Expected an absolute protected Elova-only secret directory')
print('Input syntax accepted; provenance, filesystem, image/platform and network controls still require operator review')
