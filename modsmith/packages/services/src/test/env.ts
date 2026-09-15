process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://modsmith:modsmith@localhost:5432/modsmith_test?schema=public";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-0000";
process.env.ENCRYPTION_KEY = "dGVzdC1lbmNyeXB0aW9uLWtleS10ZXN0LWVuY3J5cHRpb24=";
process.env.STORAGE_PROVIDER = "local";
process.env.LOCAL_STORAGE_DIR = "/tmp/modsmith-test-storage";
process.env.EMAIL_PROVIDER = "console";
process.env.APP_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";
