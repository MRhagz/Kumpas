import base64
import io
import json
import logging
import os
import time
import unittest
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

from kumpas_ingestion.config import ConfigError, IngestionConfig
from kumpas_ingestion.ingestion_logger import IngestionLogger, run_cli
from kumpas_ingestion.pipelines import ched_cmo, dole_ble, tesda
from kumpas_ingestion.silos import SiloId

MARKER = 'PRIVATE notes upload model-output token https://example.test?signature=SECRET'


class OperationalLoggingTests(unittest.TestCase):
    def test_payload_and_stdout_drop_sensitive_fields(self):
        database = Mock()
        logger = IngestionLogger(database, 'ched_cmo_pdf')
        with self.assertLogs('kumpas.ingestion', logging.INFO) as logs:
            logger.start(SiloId.PATH_FEASIBILITY)
            payload = logger.prepare('failure', error_message=MARKER, run_metadata={
                'url': MARKER, 'errors': [MARKER], 'total_records': 30, 'duration_ms': MARKER,
            })
            logger.record('failure', error_message=MARKER)
        text = json.dumps(payload) + str(logs.output) + str(database.mock_calls)
        self.assertNotIn(MARKER, text)
        self.assertNotIn('SECRET', text)
        self.assertEqual(payload['error_message'], 'ingestion_failed')
        self.assertEqual(payload['run_metadata']['total_records'], 30)
        self.assertIsInstance(payload['run_metadata']['duration_ms'], int)
        self.assertIn('run_id', payload['run_metadata'])

    def test_log_write_and_uncaught_errors_remain_observable_without_tracebacks(self):
        database = Mock()
        database.table.return_value.insert.return_value.execute.side_effect = RuntimeError(MARKER)
        logger = IngestionLogger(database, 'ched_cmo_pdf')
        with self.assertLogs('kumpas.ingestion', logging.INFO) as logs:
            logger.start()
            result = run_cli(lambda: logger.record('failure', error_message=MARKER))
        self.assertEqual(result, 1)
        self.assertIn('log_write_failed', str(logs.output))
        self.assertNotIn(MARKER, str(logs.output))
        self.assertNotIn('Traceback', str(logs.output))

    def test_per_publication_and_validation_reports_never_print_source_content(self):
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            ched_cmo._print_failure_report([(MARKER, MARKER)])
            dole_ble._print_failure_report([(MARKER, MARKER)])
            tesda._print_validation_report(MARKER, [MARKER])
        self.assertNotIn(MARKER, stdout.getvalue())
        self.assertIn('count=1', stdout.getvalue())


class WorkerConfigurationTests(unittest.TestCase):
    def test_rejects_broad_expired_and_malformed_worker_credentials(self):
        def token(role="ingestion_worker", exp=None):
            payload = json.dumps({"role": role, "exp": exp or time.time() + 600}).encode()
            return "header." + base64.urlsafe_b64encode(payload).decode().rstrip("=") + ".signature"
        env = {"SUPABASE_URL": "https://database.example", "SUPABASE_PUBLISHABLE_KEY": "public-key",
               "GEMINI_API_KEY": "fixture-provider-key"}
        for credential in [token("service_role"), token(exp=1), MARKER]:
            with patch.dict(os.environ, {**env, "SUPABASE_INGESTION_TOKEN": credential}, clear=True):
                with self.assertRaises(ConfigError) as error:
                    IngestionConfig.from_env()
                self.assertNotIn(credential, str(error.exception))
        with patch.dict(os.environ, {**env, "SUPABASE_INGESTION_TOKEN": token()}, clear=True):
            self.assertEqual(IngestionConfig.from_env().supabase_publishable_key, "public-key")
