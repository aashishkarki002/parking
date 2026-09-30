from django.db import migrations, models


def enable_allowance(apps, schema_editor):
    """Turn the 12h tenant allowance back on (0020 switched it off)."""
    ParkingConfiguration = apps.get_model('management', 'ParkingConfiguration')
    ParkingConfiguration.objects.update(tenant_allowance_enabled=True)


def disable_allowance(apps, schema_editor):
    ParkingConfiguration = apps.get_model('management', 'ParkingConfiguration')
    ParkingConfiguration.objects.update(tenant_allowance_enabled=False)


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0021_student_requests'),
    ]

    operations = [
        migrations.AlterField(
            model_name='parkingconfiguration',
            name='tenant_allowance_enabled',
            field=models.BooleanField(default=True, help_text='When on, registered tenant vehicles park free only up to the allowance below; time past it is billed normally. When off, pass holders park free without limit and other tenants are billed like visitors.'),
        ),
        migrations.AlterField(
            model_name='parkingconfiguration',
            name='tenant_free_hours',
            field=models.PositiveSmallIntegerField(default=12, help_text="Hours from entry that registered vehicles park free (day hours only). Re-entering inside this window doesn't restart it."),
        ),
        migrations.AlterField(
            model_name='parkingconfiguration',
            name='tenant_lookback_hours',
            field=models.PositiveSmallIntegerField(default=24, help_text='Not used by billing any more; the free window runs from entry.'),
        ),
        migrations.RunPython(enable_allowance, disable_allowance),
    ]
