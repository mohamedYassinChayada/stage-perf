import logging
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from ..models import Notification, NotificationType, ACL

logger = logging.getLogger(__name__)
User = get_user_model()


def create_notification(recipient, notification_type, title, message, document=None, actor=None):
    try:
        return Notification.objects.create(
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            message=message,
            document=document,
            actor=actor,
        )
    except Exception as e:
        logger.error(f'Failed to create notification: {e}')
        return None


def notify_document_edited(document, editor):
    if document.owner and document.owner != editor:
        create_notification(
            recipient=document.owner,
            notification_type=NotificationType.DOCUMENT_EDITED,
            title=f'Document edited: {document.title}',
            message=f'{editor.username} edited your document "{document.title}".',
            document=document,
            actor=editor,
        )


def notify_document_deleted(document, deleter):
    notified = set()
    if document.owner and document.owner != deleter:
        create_notification(
            recipient=document.owner,
            notification_type=NotificationType.DOCUMENT_DELETED,
            title=f'Document deleted: {document.title}',
            message=f'{deleter.username} deleted the document "{document.title}".',
            actor=deleter,
        )
        notified.add(document.owner.id)

    acls = ACL.objects.filter(document=document)
    for acl in acls:
        if acl.subject_type == 'user':
            try:
                user = User.objects.get(id=int(acl.subject_id))
                if user.id not in notified and user != deleter:
                    create_notification(
                        recipient=user,
                        notification_type=NotificationType.DOCUMENT_DELETED,
                        title=f'Document deleted: {document.title}',
                        message=f'{deleter.username} deleted the document "{document.title}" you had access to.',
                        actor=deleter,
                    )
                    notified.add(user.id)
            except (User.DoesNotExist, ValueError):
                pass
        elif acl.subject_type == 'group':
            try:
                group = Group.objects.get(id=int(acl.subject_id))
                for user in group.user_set.all():
                    if user.id not in notified and user != deleter:
                        create_notification(
                            recipient=user,
                            notification_type=NotificationType.DOCUMENT_DELETED,
                            title=f'Document deleted: {document.title}',
                            message=f'{deleter.username} deleted the document "{document.title}" shared with group "{group.name}".',
                            actor=deleter,
                        )
                        notified.add(user.id)
            except (Group.DoesNotExist, ValueError):
                pass


def _get_acl_recipients(acl, exclude_user=None):
    recipients = []
    if acl.subject_type == 'user':
        try:
            user = User.objects.get(id=int(acl.subject_id))
            if user != exclude_user:
                recipients.append(user)
        except (User.DoesNotExist, ValueError):
            pass
    elif acl.subject_type == 'group':
        try:
            group = Group.objects.get(id=int(acl.subject_id))
            for user in group.user_set.all():
                if user != exclude_user:
                    recipients.append(user)
        except (Group.DoesNotExist, ValueError):
            pass
    return recipients


def notify_acl_granted(acl, granter):
    doc_title = acl.document.title if acl.document else 'Unknown'
    for recipient in _get_acl_recipients(acl, exclude_user=granter):
        create_notification(
            recipient=recipient,
            notification_type=NotificationType.ACL_GRANTED,
            title=f'Access granted: {doc_title}',
            message=f'{granter.username} granted you {acl.role} access to "{doc_title}".',
            document=acl.document,
            actor=granter,
        )


def notify_acl_revoked(acl, revoker):
    doc_title = acl.document.title if acl.document else 'Unknown'
    for recipient in _get_acl_recipients(acl, exclude_user=revoker):
        create_notification(
            recipient=recipient,
            notification_type=NotificationType.ACL_REVOKED,
            title=f'Access revoked: {doc_title}',
            message=f'{revoker.username} revoked your access to "{doc_title}".',
            document=acl.document,
            actor=revoker,
        )


def notify_acl_changed(acl, old_role, new_role, changer):
    doc_title = acl.document.title if acl.document else 'Unknown'
    for recipient in _get_acl_recipients(acl, exclude_user=changer):
        create_notification(
            recipient=recipient,
            notification_type=NotificationType.ACL_CHANGED,
            title=f'Access changed: {doc_title}',
            message=f'{changer.username} changed your access to "{doc_title}" from {old_role} to {new_role}.',
            document=acl.document,
            actor=changer,
        )


def notify_account_approved(user):
    create_notification(
        recipient=user,
        notification_type=NotificationType.ACCOUNT_APPROVED,
        title='Account approved',
        message='Your account has been approved. You now have full access to the platform.',
    )


def notify_account_rejected(user, reason=''):
    msg = 'Your account has been rejected.'
    if reason:
        msg += f' Reason: {reason}'
    create_notification(
        recipient=user,
        notification_type=NotificationType.ACCOUNT_REJECTED,
        title='Account rejected',
        message=msg,
    )


def notify_new_registration(new_user):
    admins = User.objects.filter(is_superuser=True)
    for admin in admins:
        create_notification(
            recipient=admin,
            notification_type=NotificationType.NEW_REGISTRATION,
            title='New user registration',
            message=f'{new_user.username} ({new_user.email}) has registered and is awaiting approval.',
            actor=new_user,
        )


def notify_email_verified(user):
    admins = User.objects.filter(is_superuser=True)
    for admin in admins:
        create_notification(
            recipient=admin,
            notification_type=NotificationType.EMAIL_VERIFIED,
            title='Email verified',
            message=f'{user.username} ({user.email}) has verified their email and is now pending approval.',
            actor=user,
        )
