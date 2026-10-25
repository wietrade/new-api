package common

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 验证码必须是一次性的：注册/重置密码成功后立即失效，否则在有效期内可被
// 重复使用（同一封邮件可用于批量注册或反复重置）。

func TestVerifyAndConsumeCodeAllowsSingleUse(t *testing.T) {
	const email = "consume-once@example.com"
	RegisterVerificationCodeWithKey(email, "123456", EmailVerificationPurpose)

	require.True(t, VerifyAndConsumeCode(email, "123456", EmailVerificationPurpose), "首次校验应通过")
	assert.False(t, VerifyAndConsumeCode(email, "123456", EmailVerificationPurpose), "同一验证码不能二次通过")
}

func TestVerifyAndConsumeCodeKeepsCodeAfterWrongAttempt(t *testing.T) {
	const email = "wrong-then-right@example.com"
	RegisterVerificationCodeWithKey(email, "abcdef", EmailVerificationPurpose)

	assert.False(t, VerifyAndConsumeCode(email, "000000", EmailVerificationPurpose), "错误验证码不能通过")
	assert.True(t, VerifyAndConsumeCode(email, "abcdef", EmailVerificationPurpose), "输错一次后正确验证码仍应有效")
}

func TestVerifyAndConsumeCodeRejectsExpiredCode(t *testing.T) {
	const email = "expired@example.com"
	RegisterVerificationCodeWithKey(email, "expired", EmailVerificationPurpose)

	verificationMutex.Lock()
	value := verificationMap[EmailVerificationPurpose+email]
	value.time = time.Now().Add(-time.Duration(VerificationValidMinutes+1) * time.Minute)
	verificationMap[EmailVerificationPurpose+email] = value
	verificationMutex.Unlock()

	assert.False(t, VerifyAndConsumeCode(email, "expired", EmailVerificationPurpose), "过期验证码必须拒绝")
}
