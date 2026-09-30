from django.db import migrations

# Hardcoded rather than imported from user_app.roles — see 0002_seed_roles.
ROLE_NAME = 'tenant'


def create_role(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.get_or_create(name=ROLE_NAME)


def remove_role(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name=ROLE_NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('user_app', '0003_user_vendor'),
    ]

    operations = [
        migrations.RunPython(create_role, remove_role),
    ]
