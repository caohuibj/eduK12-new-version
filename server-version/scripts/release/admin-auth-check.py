"""Check running production API administrator settings without printing secrets."""
import argparse
import subprocess
from pathlib import Path

PROBE = r"""
const { createHash } = require('node:crypto')
const env = process.env
const key = env.ADMIN_MFA_ENCRYPTION_KEY || ''
const origin = env.ADMIN_AUTH_ORIGIN || env.ADMIN_WEBAUTHN_ORIGIN
const rp = env.ADMIN_WEBAUTHN_RP_ID
if (origin !== 'https://training.eduk12.top' || (rp && rp !== 'training.eduk12.top')) process.exit(2)
if (!/^[0-9a-f]{64}$/i.test(key) || /^(.)\1{63}$/i.test(key)) process.exit(3)
for (const name of ['JWT_SECRET', 'CAMPUS_MFA_ENCRYPTION_KEY', 'SURVEY_MFA_ENCRYPTION_KEY', 'LEGACY_DATA_ENCRYPTION_KEY']) {
  if (env[name]?.toLowerCase() === key.toLowerCase()) process.exit(4)
}
if (env.ADMIN_REQUIRE_TOTP !== 'true') process.exit(5)
process.stdout.write(createHash('sha256').update(Buffer.from(key, 'hex')).digest('hex'))
"""
PROBE_ERRORS = {
    2: "管理来源或安全密钥 RP 配置不符",
    3: "缺少有效的管理员 MFA 加密密钥",
    4: "管理员 MFA 加密密钥与其他应用密钥相同",
    5: "ADMIN_REQUIRE_TOTP 未启用",
}


def check(entry, run=subprocess.run):
    if not entry.is_absolute() or not entry.is_file():
        raise ValueError("请指定现行生产 Compose 入口脚本的绝对路径")
    fingerprints = []
    for service in ("backend", "backend-2"):
        try:
            result = run([str(entry), "exec", "-T", service, "node", "-e", PROBE],
                         capture_output=True, text=True, timeout=12, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise ValueError(f"{service} 无法在限定时间内完成管理认证配置检查") from None
        if result.returncode:
            raise ValueError(f"{service}: {PROBE_ERRORS.get(result.returncode, '无法检查运行中的 API')}")
        fingerprint = result.stdout.strip()
        if len(fingerprint) != 64 or any(c not in "0123456789abcdef" for c in fingerprint):
            raise ValueError(f"{service}: 管理认证配置检查返回异常")
        fingerprints.append(fingerprint)
    if fingerprints[0] != fingerprints[1]:
        raise ValueError("双 API 的管理员 MFA 加密密钥不一致")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compose-entry", required=True, type=Path)
    args = parser.parse_args()
    try:
        check(args.compose_entry)
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    print("双 API 管理域、独立 MFA 密钥和 Authenticator 要求通过")
