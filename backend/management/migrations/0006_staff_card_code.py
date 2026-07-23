import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0005_alter_staff_options_staff_email'),
    ]

    operations = [
        migrations.AddField(
            model_name='staff',
            name='card_code',
            field=models.UUIDField(
                null=True, editable=False,
                help_text="Encoded on the tenant's permanent physical parking card (QR/barcode)."
            ),
        ),
    ]
