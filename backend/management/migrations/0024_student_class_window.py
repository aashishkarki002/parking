import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('management', '0023_lost_ticket'),
    ]

    operations = [
        migrations.AddField(
            model_name='parkingconfiguration',
            name='student_early_grace_minutes',
            field=models.PositiveIntegerField(
                default=15,
                help_text='A student arriving up to this many minutes before class start is also free '
                          'for that early time.'),
        ),
        migrations.AlterField(
            model_name='parkingconfiguration',
            name='student_free_minutes',
            field=models.PositiveIntegerField(
                default=150,
                help_text='Default free minutes from class start, for tenants without their own '
                          'Vendor.student_free_minutes.'),
        ),
        migrations.AddField(
            model_name='vendor',
            name='student_free_minutes',
            field=models.PositiveIntegerField(
                blank=True, null=True,
                help_text='Free minutes from class start for this tenant\'s students. '
                          'Blank uses the global default (Parking Configuration).'),
        ),
        migrations.AlterField(
            model_name='parkingsession',
            name='student',
            field=models.ForeignKey(
                blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='sessions', to='management.student',
                help_text='Approved student matched by vehicle number or student card; '
                          'parks free inside their class window (Student.free_window).'),
        ),
    ]
