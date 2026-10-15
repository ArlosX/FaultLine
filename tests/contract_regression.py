"""Offline regression tests of contract execution, with SDK-shaped web responses.

These exercise Python control flow and receipt integrity, not live LLM consensus.
"""
import importlib.util
import hashlib
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
        gl.message.sender_address.as_hex = '0x' + '1' * 40
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

    def test_only_deployer_can_initialize_canonical_suites(self):
        contract = module.Faultline()
        gl.message.sender_address.as_hex = '0x' + '2' * 40
        with self.assertRaisesRegex(UserError, 'Only the deployer'):
            contract.bootstrap_suites(module.CANONICAL_BASE_URL)
        self.assertEqual(contract.get_suites(), {})

    def test_canonical_host_cannot_be_substituted(self):
        contract = module.Faultline()
        with self.assertRaisesRegex(UserError, 'fixture host is fixed'):
            contract.bootstrap_suites('https://attacker.example')
        self.assertEqual(contract.get_suites(), {})

    def test_canonical_bootstrap_is_one_time(self):
        before = self.contract.get_suites()
        with self.assertRaisesRegex(UserError, 'already initialized'):
            self.contract.bootstrap_suites(module.CANONICAL_BASE_URL)
        self.assertEqual(self.contract.get_suites(), before)

    def test_reserved_suite_cannot_be_overwritten_after_bootstrap(self):
        before = self.contract.get_suite('injection-immunity')
        with self.assertRaisesRegex(UserError, 'reserved'):
            self.contract.create_suite(
                'injection-immunity', 'replacement', 'https://attacker.example/policy',
                'https://attacker.example/base', 'https://attacker.example/fault',
                'PROMPT INJECTION', 'REJECT', 'REJECT', 'a' * 64, 'b' * 64, 'c' * 64,
            )
        self.assertEqual(self.contract.get_suite('injection-immunity'), before)

    def test_canonical_identifiers_cannot_be_squatted(self):
        contract = module.Faultline()
        with self.assertRaisesRegex(UserError, 'reserved'):
            contract.create_suite(
                'injection-immunity', 'fake', 'https://attacker.example/policy',
                'https://attacker.example/base', 'https://attacker.example/fault',
                'PROMPT INJECTION', 'REJECT', 'REJECT', 'a' * 64, 'b' * 64, 'c' * 64,
            )
        self.assertEqual(contract.get_suites(), {})

    def test_canonical_manifest_is_versioned_and_committed(self):
        protocol = self.contract.get_protocol()
        self.assertTrue(protocol['initialized'])
        self.assertEqual(protocol['version'], module.BENCHMARK_VERSION)
        self.assertEqual(set(self.contract.get_suites()), set(module.CANONICAL_IDS))
        for suite in self.contract.get_suites().values():
            self.assertTrue(suite['canonical'])
            self.assertEqual(suite['fixture_version'], module.BENCHMARK_VERSION)
            manifest = dict(suite)
            digest = manifest.pop('suite_sha256')
            self.assertEqual(digest, hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest())
            for label in ('policy', 'baseline', 'challenge'):
                body = (ROOT / 'public/fixtures' / suite[label + '_url'].rsplit('/', 1)[1]).read_bytes()
                self.assertEqual(suite[label + '_sha256'], hashlib.sha256(body).hexdigest())

    def test_changed_policy_or_evidence_cannot_create_a_receipt(self):
        for changed_file in ('policy.txt', 'baseline-reject.txt', 'challenge-injection.txt'):
            with self.subTest(changed_file=changed_file):
                def fetch(url, *, method):
                    body = (ROOT / 'public/fixtures' / url.rsplit('/', 1)[1]).read_bytes()
                    if url.endswith(changed_file):
                        body += b'\nATTACKER MODIFICATION'
                    return Response(200, {}, body)
                gl.nondet.web.request = Mock(side_effect=fetch)
                with self.assertRaisesRegex(UserError, 'immutable SHA-256 commitment'):
                    self.contract.execute_suite('injection-immunity', 'mutated-' + changed_file)
                self.assertEqual(self.contract.get_runs(), {})

    def test_every_canonical_fixture_is_pinned_before_any_model_call(self):
        for suite_id, suite in self.contract.get_suites().items():
            for phase in ('policy', 'baseline', 'challenge'):
                with self.subTest(suite=suite_id, phase=phase):
                    gl.nondet.exec_prompt.reset_mock()
                    changed_url = suite[phase + '_url']
                    def fetch(url, *, method):
                        body = (ROOT / 'public/fixtures' / url.rsplit('/', 1)[1]).read_bytes()
                        if url == changed_url:
                            body += b' changed'
                        return Response(200, {}, body)
                    gl.nondet.web.request = Mock(side_effect=fetch)
                    with self.assertRaisesRegex(UserError, 'immutable SHA-256 commitment'):
                        self.contract.execute_suite(suite_id, 'changed-' + suite_id + '-' + phase)
                    gl.nondet.exec_prompt.assert_not_called()
                    self.assertEqual(self.contract.get_runs(), {})

    def test_oversized_source_is_rejected_before_model_call(self):
        self.assert_source_rejected(Response(200, {}, b'x' * 9001))

    def test_invalid_utf8_source_is_rejected_before_model_call(self):
        self.assert_source_rejected(Response(200, {}, b'\xff'))

    def test_run_identifier_cannot_be_reused(self):
        self.contract.execute_suite('injection-immunity', 'unique-run')
        before = self.contract.get_run('unique-run')
        gl.nondet.exec_prompt.reset_mock()
        with self.assertRaisesRegex(UserError, 'already exists'):
            self.contract.execute_suite('injection-immunity', 'unique-run')
        self.assertEqual(self.contract.get_run('unique-run'), before)
        gl.nondet.exec_prompt.assert_not_called()

    def test_all_four_canonical_outcomes_are_accepted_from_independent_assessments(self):
        quote_reject = 'deployment R-204 was cancelled before completion'
        quote_support = 'R-204'
        def model(prompt, *, response_format):
            self.assertEqual(response_format, 'json')
            evidence = prompt.rsplit(' EVIDENCE BEGIN\n', 1)[1].split(' EVIDENCE END', 1)[0]
            if 'CONFLICT CHALLENGE' in evidence:
                return {'outcome': 'UNCLEAR', 'quote': ''}
            if 'cancelled before completion' in evidence:
                return {'outcome': 'REJECT', 'quote': quote_reject}
            return {'outcome': 'SUPPORT', 'quote': quote_support}
        gl.nondet.exec_prompt = Mock(side_effect=model)
        for suite_id in module.CANONICAL_IDS:
            with self.subTest(suite_id=suite_id):
                self.contract.execute_suite(suite_id, 'run-' + suite_id)
                run = self.contract.get_run('run-' + suite_id)
                suite = self.contract.get_suite(suite_id)
                self.assertTrue(run['passed'])
                self.assertEqual(run['suite_sha256'], suite['suite_sha256'])
                self.assertEqual(run['fixture_version'], module.BENCHMARK_VERSION)
                self.assertEqual(run['baseline_outcome'], suite['expected_baseline'])
                self.assertEqual(run['challenge_outcome'], suite['expected_challenge'])

    def test_independent_validator_disagreement_creates_no_receipt(self):
        reject = {'outcome': 'REJECT', 'quote': 'deployment R-204 was cancelled before completion'}
        unclear = {'outcome': 'UNCLEAR', 'quote': ''}
        gl.nondet.exec_prompt = Mock(side_effect=[reject, reject, unclear, unclear])
        with self.assertRaisesRegex(RuntimeError, 'disagreed'):
            self.contract.execute_suite('injection-immunity', 'run-1')
        self.assertEqual(self.contract.get_runs(), {})

    def test_validator_rejects_fabricated_leader_quote(self):
        original = gl.vm.run_nondet_unsafe
        def malicious_leader(assess, validate):
            result = assess()
            result['baseline_quote'] = 'text never present in the committed fixture'
            if validate(Return(result)):
                raise AssertionError('validator accepted a fabricated quote')
            raise RuntimeError('forged quote rejected')
        gl.vm.run_nondet_unsafe = malicious_leader
        try:
            with self.assertRaisesRegex(RuntimeError, 'forged quote rejected'):
                self.contract.execute_suite('injection-immunity', 'quote-attack')
            self.assertEqual(self.contract.get_runs(), {})
        finally:
            gl.vm.run_nondet_unsafe = original

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
