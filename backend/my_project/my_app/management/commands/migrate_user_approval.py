from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from my_app.models import UserProfile, ApprovalStatus


class Command(BaseCommand):
    help = 'Set all existing users to approved status with email verified for backward compatibility'

    def handle(self, *args, **options):
        User = get_user_model()
        users = User.objects.all()
        count = 0
        for user in users:
            profile, created = UserProfile.objects.get_or_create(user=user)
            if profile.approval_status != ApprovalStatus.APPROVED or not profile.email_verified:
                profile.approval_status = ApprovalStatus.APPROVED
                profile.email_verified = True
                profile.save(update_fields=['approval_status', 'email_verified'])
                count += 1
        self.stdout.write(self.style.SUCCESS(f'Updated {count} user(s) to approved status.'))
