"""
URL configuration for parkingcore project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from django.conf.urls import include
from django.http import HttpResponse
from management.admin import parking_admin_site

def blank_home(request):
    return HttpResponse("Goto admin Page for Dashboard!!")

urlpatterns = [
    # path('grappelli/', include('grappelli.urls')),
    path('', blank_home),
    path('admin/', parking_admin_site.urls),
    path('api/v1/parking/', include('management.urls')),
    path('api/v1/public/user-app/users/', include('user_app.urls')),
]
