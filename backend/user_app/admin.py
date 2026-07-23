# user_app/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

class CustomUserAdmin(UserAdmin):
    # The fields to be used in displaying the User model in admin
    list_display = ('email', 'first_name', 'last_name', 'is_staff', 'is_superuser')
    list_filter = ('is_staff', 'is_superuser', 'is_email_verified', 'is_phone_verified')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'phone_no', 'photo')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 
                                   'is_email_verified', 'is_phone_verified',
                                   'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )
    search_fields = ('email', 'first_name', 'last_name', 'phone_no')
    ordering = ('email',)
    filter_horizontal = ('groups', 'user_permissions',)

# Register the custom User model with the custom UserAdmin
admin.site.register(User, CustomUserAdmin)