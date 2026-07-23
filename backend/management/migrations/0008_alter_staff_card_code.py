import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0007_staff_card_code_backfill'),
    ]

    operations = [
        migrations.AlterField(
            model_name='staff',
            name='card_code',
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, unique=True, db_index=True,
                help_text="Encoded on the tenant's permanent physical parking card (QR/barcode)."
            ),
        ),
    ]
