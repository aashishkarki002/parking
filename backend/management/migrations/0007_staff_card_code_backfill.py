import uuid
from django.db import migrations


def populate_card_codes(apps, schema_editor):
    Staff = apps.get_model('management', 'Staff')
    for staff in Staff.objects.filter(card_code__isnull=True):
        staff.card_code = uuid.uuid4()
        staff.save(update_fields=['card_code'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0006_staff_card_code'),
    ]

    operations = [
        migrations.RunPython(populate_card_codes, noop_reverse),
    ]
