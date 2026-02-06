import random
import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_verification_code():
    return str(random.randint(100000, 999999))


def send_verification_email(user, code):
    api_key = getattr(settings, 'BREVO_API_KEY', '')
    if not api_key:
        logger.warning('BREVO_API_KEY not configured, skipping email send')
        return False

    try:
        import sib_api_v3_sdk
        from sib_api_v3_sdk.rest import ApiException

        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key['api-key'] = api_key
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))

        sender = {
            'name': getattr(settings, 'BREVO_SENDER_NAME', 'Stage Perf'),
            'email': getattr(settings, 'BREVO_SENDER_EMAIL', 'noreply@stage-perf.com'),
        }

        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{'email': user.email, 'name': user.username}],
            sender=sender,
            subject='Verify your email - Stage Perf',
            html_content=f'''
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Email Verification</h2>
                <p>Hello {user.username},</p>
                <p>Your verification code is:</p>
                <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; border-radius: 8px; margin: 20px 0;">
                    {code}
                </div>
                <p>This code expires in 15 minutes.</p>
                <p>If you did not create an account, please ignore this email.</p>
            </body>
            </html>
            ''',
        )

        api_instance.send_transac_email(send_smtp_email)
        logger.info(f'Verification email sent to {user.email}')
        return True

    except Exception as e:
        logger.error(f'Failed to send verification email to {user.email}: {e}')
        return False
