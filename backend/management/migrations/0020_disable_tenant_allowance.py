from django.db import migrations, models


def disable_allowance(apps, schema_editor):
    """Turn the 12h tenant allowance off for now. Re-enable it in Django
    admin -> Parking System Configuration when it should go live."""
    ParkingConfiguration = apps.get_model('management', 'ParkingConfiguration')
    ParkingConfiguration.objects.update(tenant_allowance_enabled=False)


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0019_night_pricing'),
    ]

    operations = [
        migrations.AlterField(
            model_name='parkingconfiguration',
            name='tenant_allowance_enabled',
            field=models.BooleanField(default=False, help_text='When on, registered tenant vehicles park free only up to the allowance below; time past it is billed normally. When off, pass holders park free without limit and other tenants are billed like visitors.'),
        ),
        migrations.RunPython(disable_allowance, migrations.RunPython.noop),
    ]
