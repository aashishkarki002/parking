# parking_management/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create a router and register our viewsets with it.
router = DefaultRouter(trailing_slash=False)
router.register(r'pricing-plans', views.PricingPlanViewSet)
router.register(r'vehicle-types', views.VehicleTypeViewSet)
router.register(r'vendors', views.VendorViewSet)
router.register(r'staff', views.StaffViewSet)
router.register(r'coupons', views.CouponViewSet)
router.register(r'coupon-batches', views.CouponBatchViewSet, basename='couponbatch')
router.register(r'parking-passes', views.ParkingPassViewSet)
router.register(r'sessions', views.ParkingSessionViewSet, basename='parkingsession')

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