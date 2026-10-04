# parking_management/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import dashboard_views, report_views, student_views, tenant_views, views

# Create a router and register our viewsets with it.
router = DefaultRouter(trailing_slash=False)
router.register(r'pricing-plans', views.PricingPlanViewSet)
router.register(r'vehicle-types', views.VehicleTypeViewSet)
router.register(r'vendors', views.VendorViewSet)
router.register(r'staff', views.StaffViewSet)
router.register(r'rfid-cards', views.RFIDCardViewSet)
router.register(r'coupons', views.CouponViewSet)
router.register(r'coupon-batches', views.CouponBatchViewSet, basename='couponbatch')
router.register(r'parking-passes', views.ParkingPassViewSet)
router.register(r'sessions', views.ParkingSessionViewSet, basename='parkingsession')
router.register(r'operators', views.OperatorViewSet, basename='operator')
router.register(r'student-requests', student_views.StudentRequestViewSet, basename='studentrequest')
router.register(r'students', student_views.StudentViewSet, basename='student')
router.register(r'tenant/student-requests', student_views.TenantStudentRequestViewSet, basename='tenant-studentrequest')
router.register(r'tenant/students', student_views.TenantStudentViewSet, basename='tenant-student')
router.register(r'tenant/vehicles', tenant_views.TenantVehicleViewSet, basename='tenant-vehicle')

# The API URLs are now determined automatically by the router.
urlpatterns = [
    # Singleton configuration view
    path('configuration/', views.ParkingConfigurationView.as_view(), name='parking-configuration'),

    # Custom endpoint paths
    path('parking-passes/<int:pk>/print/', views.ParkingPassPrintView.as_view(), name='parking-pass-print'),
    path('staff/card/<uuid:object_id>/print/', views.StaffCardPrintView.as_view(), name='staff-card-print'),
    path('staff/card/<uuid:object_id>/digital/', views.StaffCardDigitalView.as_view(), name='staff-card-digital'),
    path('staff/card/<uuid:object_id>/token/', views.staff_card_token, name='staff-card-token'),
    path('sessions/tenant-card/scan', views.tenant_card_scan, name='tenant-card-scan'),
    path('sessions/tenant-card/confirm', views.tenant_card_confirm, name='tenant-card-confirm'),
    path('rfid-tap', views.rfid_tap, name='rfid-tap'),
    path('rfid-force-entry', views.rfid_force_entry, name='rfid-force-entry'),
    path('rfid-today', views.rfid_today, name='rfid-today'),
    path('rfid-lookup', views.rfid_lookup, name='rfid-lookup'),
    path('rfid-taps', views.rfid_taps, name='rfid-taps'),
    path('rates', views.parking_rates, name='parking-rates'),
    path('search', views.global_search, name='global-search'),
    path('dashboard/summary', dashboard_views.dashboard_summary, name='dashboard-summary'),
    path('dashboard/sessions', dashboard_views.dashboard_sessions, name='dashboard-sessions'),
    path('dashboard/session-counts', dashboard_views.session_counts, name='dashboard-session-counts'),
    path('reports/summary', report_views.report_summary, name='report-summary'),
    path('sessions-table', report_views.sessions_table, name='sessions-table'),
    path('sessions-table/overview', report_views.sessions_overview, name='sessions-overview'),
    path('statements/visits', report_views.statement_visits, name='statement-visits'),
    path('statements/months', report_views.statement_months, name='statement-months'),
    path('pass-lapsed-usage', report_views.lapsed_pass_usage, name='lapsed-pass-usage'),

    # Students (tenant portal requests, admin review, POS card) — see student_views.py
    path('student-requests/template.csv', student_views.student_template_csv, name='student-template-csv'),
    path('student-card/scan', student_views.student_card_scan, name='student-card-scan'),

    # EasyManage integration (Sallyan House gate) — full path:
    # /api/v1/parking/integrations/easymanage/webhook
    path('integrations/easymanage/webhook', views.easymanage_webhook, name='easymanage-webhook'),
    # /api/v1/parking/integrations/easymanage/vendors/<id>/usage
    path(
        'integrations/easymanage/vendors/<str:external_tenant_id>/usage',
        views.easymanage_vendor_usage,
        name='easymanage-vendor-usage',
    ),

    # Router views
    path('', include(router.urls)),
]