# management/admin.py
from datetime import timedelta
from django.contrib import admin
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html
from django.db.models import Sum
from decimal import Decimal
from rangefilter.filters import DateRangeFilter
from . import views
import uuid
from .models import (
    ParkingConfiguration, PricingPlan, VehicleType,
    Vendor, Staff, Coupon, CouponBatch,
    ParkingPass, ParkingSession, CardScanLog, TicketStamp, TenantBill
)


# =============================================
# 1. CUSTOM ADMIN SITE CLASS (FIXED VERSION)
# =============================================
class ParkingAdminSite(admin.AdminSite):
    site_header = "Parking Management System"
    site_title = "Parking Admin Portal"
    index_title = "Dashboard"

    def get_app_list(self, request, app_label=None):
        """
        Group related models in the admin index
        """
        app_list = super().get_app_list(request, app_label)

        # If app_label is specified (for app_index view), return the original list
        if app_label is not None:
            return app_list

        # Get all registered models
        registry = self._registry
        model_admins = [
            (model, model_admin)
            for model, model_admin in registry.items()
        ]

        # Organize models into groups
        config_models = [m for m in model_admins if
                         m[0].__name__ in ['ParkingConfiguration', 'PricingPlan', 'VehicleType']]
        people_models = [m for m in model_admins if m[0].__name__ in ['Vendor', 'Staff']]
        coupon_models = [m for m in model_admins if m[0].__name__ in ['CouponBatch', 'Coupon', 'ParkingPass']]
        activity_models = [m for m in model_admins if m[0].__name__ in ['ParkingSession', 'CardScanLog', 'TicketStamp', 'TenantBill']]
        user_models = [m for m in model_admins if m[0].__name__ in ['User', 'Group']]

        # Build custom app list
        custom_app_list = []

        if config_models:
            custom_app_list.append({
                'name': 'System Configuration',
                'app_label': 'configuration',
                'models': [self._build_model_dict(m[0], m[1], request) for m in config_models]
            })

        if people_models:
            custom_app_list.append({
                'name': 'Tenant Management',
                'app_label': 'people',
                'models': [self._build_model_dict(m[0], m[1], request) for m in people_models]
            })

        if coupon_models:
            custom_app_list.append({
                'name': 'Coupons & Passes',
                'app_label': 'coupons',
                'models': [self._build_model_dict(m[0], m[1], request) for m in coupon_models]
            })

        if activity_models:
            custom_app_list.append({
                'name': 'Parking Activity',
                'app_label': 'activity',
                'models': [self._build_model_dict(m[0], m[1], request) for m in activity_models]
            })

        if user_models:
            custom_app_list.append({
                'name': 'User Management',
                'app_label': 'users',
                'models': [self._build_model_dict(m[0], m[1], request) for m in user_models]
            })

        return custom_app_list

    def _build_model_dict(self, model, model_admin, request):
        """Build model dictionary for navigation"""
        return {
            'name': model._meta.verbose_name_plural,
            'object_name': model._meta.object_name,
            'admin_url': reverse(
                f'{self.name}:{model._meta.app_label}_{model._meta.model_name}_changelist',
                current_app=self.name
            ),
            'add_url': reverse(
                f'{self.name}:{model._meta.app_label}_{model._meta.model_name}_add',
                current_app=self.name
            ),
            'view_only': not model_admin.has_view_permission(request),
        }


# Create instance of custom admin site
parking_admin_site = ParkingAdminSite(name='parking_admin')


# =============================================
# 2. BASE ADMIN CLASSES (FOR REUSE)
# =============================================
class BaseAdmin(admin.ModelAdmin):
    """Base class with common settings"""
    list_per_page = 25
    save_on_top = True
    save_as = True


class ReadOnlyAdmin(BaseAdmin):
    """For models that shouldn't be modified"""

    def has_add_permission(self, request): return False

    def has_change_permission(self, request, obj=None): return False

    def has_delete_permission(self, request, obj=None): return False


# =============================================
# 3. MODEL ADMIN CLASSES (REGISTERED PROPERLY)
# =============================================

# System Configuration
@admin.register(ParkingConfiguration, site=parking_admin_site)
class ParkingConfigurationAdmin(ReadOnlyAdmin):
    list_display = ('company_name', 'currency_symbol')

    def has_add_permission(self, request):
        return not ParkingConfiguration.objects.exists()


@admin.register(PricingPlan, site=parking_admin_site)
class PricingPlanAdmin(BaseAdmin):
    list_display = ('name', 'plan_type', 'minimum_charge')
    search_fields = ('name',)
    list_filter = ('plan_type',)


@admin.register(VehicleType, site=parking_admin_site)
class VehicleTypeAdmin(BaseAdmin):
    list_display = ('name', 'pricing_plan', 'free_duration_minutes')
    autocomplete_fields = ('pricing_plan',)
    search_fields = ('name',)


# People Management
@admin.register(Vendor, site=parking_admin_site)
class VendorAdmin(BaseAdmin):
    list_display = ('name', 'location', 'contact_person', 'contact_email', 'stamp_free_minutes')
    search_fields = ('name', 'contact_person', 'location')


class ParkingPassInline(admin.TabularInline):
    model = ParkingPass
    extra = 0
    fk_name = "staff"
    fields = ('valid_from', 'valid_until', 'price_paid', 'is_active')


@admin.register(Staff, site=parking_admin_site)
class StaffAdmin(BaseAdmin):
    list_display = ('name', 'license_plate', 'company', 'vehicle_type', 'is_card_active', 'card_links')
    search_fields = ('name', 'license_plate', 'company__name')
    list_filter = ('company', 'vehicle_type', 'is_card_active')
    autocomplete_fields = ('company', 'vehicle_type')
    readonly_fields = ('card_code', 'card_issued_at')
    inlines = [ParkingPassInline]
    actions = ['deactivate_cards', 'reactivate_cards', 'regenerate_card_code']

    def card_links(self, obj):
        return format_html(
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=800,height=600\');">Print (Physical)</a>&nbsp;'
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=400,height=600\');">Digital Card</a>',
            reverse('parking_admin:management_staff_card_print', args=[obj.card_code]),
            reverse('parking_admin:management_staff_card_digital', args=[obj.card_code]),
        )
    card_links.short_description = 'Card'

    def deactivate_cards(self, request, queryset):
        count = queryset.update(is_card_active=False)
        self.message_user(request, f'{count} card(s) deactivated. Blocked at the gate immediately.')
    deactivate_cards.short_description = "Deactivate selected cards (lost/leaked)"

    def reactivate_cards(self, request, queryset):
        count = queryset.update(is_card_active=True)
        self.message_user(request, f'{count} card(s) reactivated.')
    reactivate_cards.short_description = "Reactivate selected cards"

    def regenerate_card_code(self, request, queryset):
        for staff in queryset:
            staff.card_code = uuid.uuid4()
            staff.is_card_active = True
            staff.save(update_fields=['card_code', 'is_card_active'])
        self.message_user(
            request,
            f'{queryset.count()} card code(s) regenerated. Old physical AND digital cards for '
            'these tenants no longer work — reprint/resend.'
        )
    regenerate_card_code.short_description = "Regenerate card code (physical card lost/compromised)"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<uuid:object_id>/card/print/',
                 self.admin_site.admin_view(views.StaffCardPrintView.as_view()),
                 name='management_staff_card_print'),
            path('<uuid:object_id>/card/digital/',
                 self.admin_site.admin_view(views.StaffCardDigitalView.as_view()),
                 name='management_staff_card_digital'),
        ]
        return custom_urls + urls


# Coupons & Passes
class CouponInline(admin.TabularInline):
    model = Coupon
    extra = 0
    fields = ('code', 'is_active', 'times_used', 'max_uses')
    readonly_fields = ('code', 'times_used')
    can_delete = False


@admin.register(CouponBatch, site=parking_admin_site)
class CouponBatchAdmin(BaseAdmin):
    list_display = ('__str__', 'number_of_coupons', 'total_price', 'is_paid', 'payment_method', 'action_links')
    list_filter = ('is_paid', 'vendor', 'purchase_date')
    search_fields = ('vendor__name', 'id')
    readonly_fields = ('total_price', 'id')
    autocomplete_fields = ('vendor',)
    inlines = [CouponInline]

    fieldsets = (
        ('Purchase Info', {
            'fields': ('vendor', 'purchase_date', 'notes')
        }),
        ('Coupon Template', {
            'description': 'Define the properties for all coupons in this batch.',
            'fields': ('validation_type', 'value_minutes', 'valid_from', 'valid_until')
        }),
        ('Payment Details', {
            'fields': ('number_of_coupons', 'base_price_per_coupon', 'total_price', 'is_paid', 'payment_method')
        }),
    )

    # Prevent editing after creation to avoid regenerating coupons
    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if obj:  # If the object already exists (is being edited)
            readonly.extend([
                'vendor',
                'validation_type',
                'value_minutes',
                'number_of_coupons',
                'purchase_date'
            ])
        return readonly

    def action_links(self, obj):
        print_url = reverse('parking_admin:management_couponbatch_print', args=[obj.pk])
        email_url = reverse('parking_admin:management_couponbatch_email', args=[obj.pk])
        return format_html(
            '<div class="">'
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=800,height=600\');">Print Coupons</a>&nbsp;'
            '<a class="button" href="{}">Send Email</a>'
            '</div>',
            print_url,
            email_url
        )
    action_links.short_description = 'Export Options'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<path:object_id>/print/',
                 self.admin_site.admin_view(views.CouponBatchPrintView.as_view()),
                 name='management_couponbatch_print'),
            path('<path:object_id>/email/',
                 self.admin_site.admin_view(views.CouponBatchEmailView.as_view()),
                 name='management_couponbatch_email'),
        ]
        return custom_urls + urls


@admin.register(Coupon, site=parking_admin_site)
class CouponAdmin(BaseAdmin):
    list_display = ('code', 'batch', 'validation_type', 'price', 'issued_by', 'is_active', 'times_used', 'max_uses')
    search_fields = ('code', 'issued_by__name', 'batch__id')
    list_filter = ('is_active', 'validation_type', 'issued_by', 'batch')
    readonly_fields = ('times_used', 'batch')
    autocomplete_fields = ('issued_by',)
    actions = ['deactivate_coupons']

    def deactivate_coupons(self, request, queryset):
        count = queryset.update(is_active=False)
        self.message_user(request, f'{count} coupons were deactivated.')
    deactivate_coupons.short_description = "Deactivate selected coupons"


@admin.register(ParkingPass, site=parking_admin_site)
class ParkingPassAdmin(BaseAdmin):
    list_display = ('staff', 'valid_from', 'valid_until', 'price_paid', 'is_active', 'print_pass_link',
                    'email_pass_link')
    search_fields = ('staff__name', 'staff__license_plate')
    list_filter = ('is_active',)
    autocomplete_fields = ('staff',)

    def print_pass_link(self, obj):
        return format_html(
            '<a class="button" href="javascript:void(0);" onclick="window.open(\'{}\', \'_blank\', \'width=800,height=600\');">Print Pass</a>',
            reverse('parking_admin:management_parkingpass_print', args=[obj.pk])
        )

    print_pass_link.short_description = 'Print'

    def email_pass_link(self, obj):
        return format_html(
            '<a class="button" href="{}">Send Email</a>',
            reverse('parking_admin:management_parkingpass_email', args=[obj.pk])
        )

    email_pass_link.short_description = 'Email'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<path:object_id>/print/',
                 self.admin_site.admin_view(views.ParkingPassPrintView.as_view()),
                 name='management_parkingpass_print'),
            path('<path:object_id>/email/',
                 self.admin_site.admin_view(views.ParkingPassEmailView.as_view()),
                 name='management_parkingpass_email'),
        ]
        return custom_urls + urls


@admin.register(CardScanLog, site=parking_admin_site)
class CardScanLogAdmin(ReadOnlyAdmin):
    list_display = ('staff', 'action', 'source', 'reject_reason', 'scanned_at')
    list_filter = ('action', 'source')
    search_fields = ('staff__name', 'staff__license_plate', 'card_code_used')
    date_hierarchy = 'scanned_at'


@admin.register(TicketStamp, site=parking_admin_site)
class TicketStampAdmin(ReadOnlyAdmin):
    list_display = ('session', 'vendor', 'free_minutes_granted', 'stamped_at')
    list_filter = ('vendor',)
    search_fields = ('session__ticket_number', 'vendor__name')
    date_hierarchy = 'stamped_at'


@admin.register(TenantBill, site=parking_admin_site)
class TenantBillAdmin(ReadOnlyAdmin):
    list_display = ('session', 'vendor', 'overage_minutes', 'amount', 'created_at')
    list_filter = ('vendor',)
    search_fields = ('session__ticket_number', 'vendor__name')
    date_hierarchy = 'created_at'


# Parking Activity
@admin.register(ParkingSession, site=parking_admin_site)
class ParkingSessionAdmin(BaseAdmin):
    change_list_template = "admin/management/parkingsession/change_list.html"
    list_per_page = 50  # Fewer page turns, still light per request

    list_display = ('ticket_number', 'vehicle_type', 'entry_time', 'exit_time', 'status',
                    'calculated_charge', 'payment_method')
    search_fields = ('ticket_number', 'license_plate')
    list_filter = (
        'status',
        'vehicle_type',
        'payment_method',
        ('entry_time', DateRangeFilter),
        ('exit_time', DateRangeFilter),
    )
    actions = ['mark_paid_cash', 'mark_paid_card', 'mark_paid_online']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Default to last 6 months so we don't load years of data; user can widen via date filter
        has_date_filter = any(
            k.startswith('entry_time') or k.startswith('exit_time')
            for k in request.GET.keys()
        )
        if not has_date_filter:
            six_months_ago = timezone.now() - timedelta(days=180)
            qs = qs.filter(entry_time__gte=six_months_ago)
        return qs

    def changelist_view(self, request, extra_context=None):
        cl = self.get_changelist_instance(request)
        queryset = cl.get_queryset(request)
        # Use a single DB aggregate for total_net — no iterating over all rows
        db_totals = queryset.aggregate(total_net=Sum('calculated_charge'))
        summary_totals = {
            'total_gross': Decimal('0.00'),
            'total_discount': Decimal('0.00'),
            'total_net': db_totals['total_net'] or Decimal('0.00')
        }
        has_date_filter = any(
            k.startswith('entry_time') or k.startswith('exit_time')
            for k in request.GET.keys()
        )
        extra_context = extra_context or {}
        extra_context['summary_totals'] = summary_totals
        extra_context['currency_symbol'] = ParkingConfiguration.get_solo().currency_symbol
        extra_context['show_last_six_months_note'] = not has_date_filter
        return super().changelist_view(request, extra_context=extra_context)

    def display_undiscounted_charge(self, obj):
        currency = ParkingConfiguration.get_solo().currency_symbol
        return f"{currency}{obj.undiscounted_charge:.2f}"
    display_undiscounted_charge.short_description = 'Gross Charge'

    def display_discount_value(self, obj):
        currency = ParkingConfiguration.get_solo().currency_symbol
        return f"-{currency}{obj.discount_value:.2f}"
    display_discount_value.short_description = 'Discount'

    def _mark_as_paid_action(self, request, queryset, method):
        updatable = queryset.filter(status='COMPLETED')
        for session in updatable:
            session.mark_as_paid(method=method)
            session.save()
        self.message_user(
            request, f"{updatable.count()} session(s) marked as PAID.")

    def mark_paid_cash(self, r, q): self._mark_as_paid_action(r, q, 'CASH')
    mark_paid_cash.short_description = "Mark selected as PAID (Cash)"
    def mark_paid_card(self, r, q): self._mark_as_paid_action(r, q, 'CARD')
    mark_paid_card.short_description = "Mark selected as PAID (Card)"

    def mark_paid_online(self, r, q): self._mark_as_paid_action(
        r, q, 'ONLINE_QR')
    mark_paid_online.short_description = "Mark selected as PAID (Online/QR)"

    autocomplete_fields = ('applied_coupon',)
    readonly_fields = ('id', 'ticket_number', 'duration_minutes', 'applied_pass', 'calculated_charge',
                       'registered_staff_member', 'undiscounted_charge', 'discount_value', 'charge_after_discount')
    fieldsets = (
        ('Session Info', {'fields': ('id', 'ticket_number',
         'status', 'vehicle_type', 'registered_staff_member')}),
        ('Timestamps', {'fields': ('entry_time',
         'exit_time', 'duration_minutes')}),
        ('Billing Breakdown', {'fields': ('undiscounted_charge', 'discount_value', 'charge_after_discount',
         'calculated_charge', 'payment_method', 'applied_coupon', 'applied_pass')}),
        ('Notes', {'fields': ('notes',), 'classes': ('collapse',)}),
    )
