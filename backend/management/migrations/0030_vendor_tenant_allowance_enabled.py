from django.db import migrations, models

# Companies that only group monthly subscribers — not real tenants — so they
# must not get the tenant free allowance (see Vendor.tenant_allowance_enabled).
SUBSCRIBER_GROUPS = ['Fixed Monthly Parking']


def disable_for_subscriber_groups(apps, schema_editor):
    Vendor = apps.get_model('management', 'Vendor')
    Vendor.objects.filter(name__in=SUBSCRIBER_GROUPS).update(tenant_allowance_enabled=False)


def enable_for_subscriber_groups(apps, schema_editor):
    Vendor = apps.get_model('management', 'Vendor')
    Vendor.objects.filter(name__in=SUBSCRIBER_GROUPS).update(tenant_allowance_enabled=True)


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0029_session_report_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='vendor',
            name='tenant_allowance_enabled',
            field=models.BooleanField(default=True, help_text="Give this company's registered vehicles the daily tenant free allowance even without a pass. Turn off for subscriber-only groups (e.g. Fixed Monthly Parking): their vehicles get the allowance only while their pass is active and are billed as visitors once it lapses."),
        ),
        migrations.RunPython(disable_for_subscriber_groups, enable_for_subscriber_groups),
    ]
