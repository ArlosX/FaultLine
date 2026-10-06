"""Offline regression tests of contract execution, with SDK-shaped web responses.

These exercise Python control flow and receipt integrity, not live LLM consensus.
"""
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock
from dataclasses import dataclass

ROOT = Path(__file__).resolve().parents[1]

@dataclass
class Response:
    status: int
    headers: dict
    body: bytes | None

class UserError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message

class Return:
    def __init__(self, value):
        self.calldata = value

def consensus(assess, validate):
    try:
        result = assess()
    except UserError as error:
        if not validate(error):
            raise RuntimeError('Validators disagreed on source error')
        raise
    if not validate(Return(result)):
        raise RuntimeError('Validators disagreed')
    return result

gl = SimpleNamespace(
    Contract=object,
    public=SimpleNamespace(write=lambda f: f, view=lambda f: f),
    vm=SimpleNamespace(UserError=UserError, Return=Return, run_nondet_unsafe=consensus),
    nondet=SimpleNamespace(web=SimpleNamespace(request=None), exec_prompt=None),
    message=SimpleNamespace(sender_address=SimpleNamespace(as_hex='0x' + '1' * 40)),
    message_raw={'datetime': '2026-10-06T00:00:00Z'},
)
sdk = ModuleType('genlayer')
sdk.gl, sdk.TreeMap = gl, dict
sdk.__all__ = ['gl', 'TreeMap']
sys.modules['genlayer'] = sdk
spec = importlib.util.spec_from_file_location('faultline_contract', ROOT / 'contracts/faultline.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ContractRegression(unittest.TestCase):
    def setUp(self):
        self.contract = module.Faultline()
        self.contract.bootstrap_suites('https://faultlined.netlify.app')
        def fetch(url, *, method):
            self.assertEqual(method, 'GET')
            return Response(200, {}, (ROOT / 'public/fixtures' / url.rsplit('/', 1)[1]).read_bytes())
        gl.nondet.web.request = Mock(side_effect=fetch)
        gl.nondet.exec_prompt = Mock(return_value={'outcome': 'REJECT', 'quote': 'deployment R-204 was cancelled before completion'})

    def test_success_reads_status_field_and_records_nonempty_hashes(self):
        self.contract.execute_suite('injection-immunity', 'run-1')
        result = self.contract.get_run('run-1')
        self.assertEqual(result['classification'], 'STABLE')
        self.assertTrue(result['passed'])
        self.assertEqual(gl.nondet.web.request.call_count, 6)
        self.assertEqual(gl.nondet.exec_prompt.call_count, 4)
        self.assertNotEqual(result['policy_sha256'], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

    def assert_source_rejected(self, response):
        gl.nondet.web.request = Mock(return_value=response)
        with self.assertRaises(UserError):
            self.contract.execute_suite('injection-immunity', 'run-1')
        self.assertEqual(self.contract.get_runs(), {})
        gl.nondet.exec_prompt.assert_not_called()

    def test_http_401_is_error_not_inconclusive(self):
        self.assert_source_rejected(Response(401, {}, b'Login required'))

    def test_empty_body_is_error_not_inconclusive(self):
        self.assert_source_rejected(Response(200, {}, b''))

    def test_none_body_is_error_not_attribute_error(self):
        self.assert_source_rejected(Response(200, {}, None))

    def test_html_login_page_is_rejected(self):
        self.assert_source_rejected(Response(200, {}, b'<!DOCTYPE html><title>Login</title>'))

    def test_wrong_policy_is_rejected(self):
        self.assert_source_rejected(Response(200, {}, b'Not the benchmark policy'))

    def test_network_error_creates_no_receipt(self):
        gl.nondet.web.request = Mock(side_effect=TimeoutError('offline'))
        with self.assertRaises(TimeoutError):
            self.contract.execute_suite('injection-immunity', 'run-1')
        self.assertEqual(self.contract.get_runs(), {})

    def test_independent_validator_disagreement_creates_no_receipt(self):
        reject = {'outcome': 'REJECT', 'quote': 'deployment R-204 was cancelled before completion'}
        unclear = {'outcome': 'UNCLEAR', 'quote': ''}
        gl.nondet.exec_prompt = Mock(side_effect=[reject, reject, unclear, unclear])
        with self.assertRaisesRegex(RuntimeError, 'disagreed'):
            self.contract.execute_suite('injection-immunity', 'run-1')
        self.assertEqual(self.contract.get_runs(), {})

    def test_real_unclear_result_remains_inconclusive(self):
        support = {'outcome': 'SUPPORT', 'quote': 'deployment R-204 completed on Friday at 18:42 UTC'}
        unclear = {'outcome': 'UNCLEAR', 'quote': ''}
        gl.nondet.exec_prompt = Mock(side_effect=[support, unclear, support, unclear])
        self.contract.execute_suite('conflict-abstention', 'run-1')
        result = self.contract.get_run('run-1')
        self.assertEqual(result['classification'], 'INCONCLUSIVE')
        self.assertTrue(result['passed'])

if __name__ == '__main__':
    unittest.main(verbosity=2)
