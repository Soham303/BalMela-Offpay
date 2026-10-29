import time
from collections import defaultdict
from threading import Lock

class LoginRateLimiter:
    def __init__(self, max_attempts=10, window_seconds=60):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.attempts = defaultdict(list)
        self.lock = Lock()

    def is_rate_limited(self, identifier: str) -> bool:
        now = time.time()
        with self.lock:
            # Clean expired attempts
            self.attempts[identifier] = [
                t for t in self.attempts[identifier] if now - t < self.window_seconds
            ]
            return len(self.attempts[identifier]) >= self.max_attempts

    def record_failure(self, identifier: str):
        now = time.time()
        with self.lock:
            self.attempts[identifier].append(now)

    def record_success(self, identifier: str):
        with self.lock:
            if identifier in self.attempts:
                del self.attempts[identifier]

login_limiter = LoginRateLimiter()
